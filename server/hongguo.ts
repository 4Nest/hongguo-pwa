import { Router, type Response } from "express";
import { Readable } from "node:stream";
import type { ReadableStream } from "node:stream/web";
import { getUpstreamUrl } from "./db.ts";
import { requireAuth } from "./auth.ts";

export const hongguoRouter = Router();
hongguoRouter.use(requireAuth);

// 上游地址运行时从设置读取（管理面板可改）
const providerBase = () => `${getUpstreamUrl()}/api/v1/providers/hongguo`;
const CATEGORIES: Record<string, true> = { short: true, comic: true, rank: true };
const RANKS: Record<string, true> = {
  "comic-new": true,
  "comic-hot": true,
  "short-new": true,
  "short-hot": true,
  "short-hot-search": true,
  "short-yearly": true,
};

// 上游响应可能是 {data:{data:...}} 多层嵌套或 JSON 字符串，逐层解开
function unwrap(input: unknown): unknown {
  let cur = input;
  for (let i = 0; i < 5; i++) {
    if (typeof cur === "string") {
      try {
        cur = JSON.parse(cur);
        continue;
      } catch {
        return cur;
      }
    }
    if (cur && typeof cur === "object" && "data" in cur && Object.keys(cur).length <= 2) {
      cur = cur.data;
      continue;
    }
    return cur;
  }
  return cur;
}

async function upstreamFetch(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    return unwrap(await res.json());
  } finally {
    clearTimeout(timer);
  }
}

function upstreamError(res: Response) {
  res.status(502).json({ error: "上游服务不可用" });
}

hongguoRouter.get("/browse", async (req, res) => {
  const category = String(req.query.category ?? "");
  const page = Math.max(1, Number(req.query.page) || 1);
  if (!CATEGORIES[category]) return res.status(400).json({ error: "非法分类" });
  let url = `${providerBase()}/browse?category=${category}&page=${page}`;
  if (category === "rank") {
    const rank = String(req.query.rank ?? "");
    if (!RANKS[rank]) return res.status(400).json({ error: "非法榜单" });
    url += `&rank=${rank}`;
  }
  try {
    res.json(await upstreamFetch(url));
  } catch {
    upstreamError(res);
  }
});

hongguoRouter.get("/search", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  const page = Math.max(1, Number(req.query.page) || 1);
  if (!q) return res.json({ items: [] });
  try {
    res.json(await upstreamFetch(`${providerBase()}/search?q=${encodeURIComponent(q)}&page=${page}`));
  } catch {
    upstreamError(res);
  }
});

// 重写详情里每集的 streamUrl 为本站代理地址（原地修改解包后的 JSON）
function rewriteStreamUrls(detail: unknown): unknown {
  if (!detail || typeof detail !== "object" || !("seasons" in detail)) return detail;
  const { seasons } = detail;
  if (!Array.isArray(seasons)) return detail;
  for (const season of seasons) {
    if (!season || typeof season !== "object" || !("episodes" in season)) continue;
    const { episodes } = season;
    if (!Array.isArray(episodes)) continue;
    for (const ep of episodes) {
      if (!ep || typeof ep !== "object" || !("streamUrl" in ep)) continue;
      if (typeof ep.streamUrl === "string") {
        ep.streamUrl = `/api/hongguo/stream?u=${encodeURIComponent(ep.streamUrl)}`;
      }
    }
  }
  return detail;
}

hongguoRouter.get("/items/:id", async (req, res) => {
  try {
    res.json(rewriteStreamUrls(await upstreamFetch(`${providerBase()}/items/${encodeURIComponent(req.params.id)}`)));
  } catch {
    upstreamError(res);
  }
});

hongguoRouter.get("/stream", async (req, res) => {
  const u = String(req.query.u ?? "");
  let target: string;
  try {
    target = decodeURIComponent(u);
  } catch {
    return res.status(400).json({ error: "非法地址" });
  }
  // 防开放代理：只允许转发到当前配置的上游
  if (!target.startsWith(getUpstreamUrl())) return res.status(400).json({ error: "非法地址" });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const headers: Record<string, string> = {};
    if (req.headers.range) headers.range = String(req.headers.range);
    const up = await fetch(target, { headers, signal: ctrl.signal });
    res.status(up.status);
    for (const name of ["content-type", "content-length", "content-range", "accept-ranges"]) {
      const v = up.headers.get(name);
      if (v) res.setHeader(name, v);
    }
    if (!up.body) return res.end();
    // undici 的 ReadableStream 泛型与 node:stream/web 声明不完全兼容；二者运行时结构一致
    const body = up.body as unknown as ReadableStream;
    const stream = Readable.fromWeb(body);
    // 客户端拖动进度条会频繁中断连接，abort 引发的流错误属正常，吞掉防止进程崩溃
    stream.on("error", () => {});
    stream.pipe(res);
    res.on("close", () => {
      clearTimeout(timer);
      ctrl.abort();
    });
  } catch {
    clearTimeout(timer);
    if (!res.headersSent) upstreamError(res);
  }
});

// 海报图代理：手机只需连本站，避免第三方图床慢/中断导致的封面渲染异常。
// 黄果图床域名小时级漂移，无法枚举白名单；接口有 requireAuth 保护，放宽为任意 http(s)。
hongguoRouter.get("/poster", async (req, res) => {
  let target: string;
  try {
    target = decodeURIComponent(String(req.query.u ?? ""));
  } catch {
    return res.status(400).json({ error: "非法地址" });
  }
  try {
    const u = new URL(target);
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error();
  } catch {
    return res.status(400).json({ error: "非法地址" });
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const up = await fetch(target, { signal: ctrl.signal });
    if (!up.ok || !up.body) {
      clearTimeout(timer);
      return res.status(502).json({ error: "上游服务不可用" });
    }
    res.status(up.status);
    res.setHeader("Content-Type", up.headers.get("content-type") ?? "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");
    const len = up.headers.get("content-length");
    if (len) res.setHeader("Content-Length", len);
    const body = up.body as unknown as ReadableStream;
    const stream = Readable.fromWeb(body);
    stream.on("error", () => {});
    stream.pipe(res);
    res.on("close", () => {
      clearTimeout(timer);
      ctrl.abort();
    });
  } catch {
    clearTimeout(timer);
    if (!res.headersSent) upstreamError(res);
  }
});

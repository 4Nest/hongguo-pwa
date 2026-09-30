import { Router } from "express";
import { Readable } from "node:stream";
import type { ReadableStream } from "node:stream/web";
import { userHuangguoAllowed } from "../db.ts";
import { requireAuth, type AuthedRequest } from "../auth.ts";
import { callWidget } from "../widget.ts";

export const huangguoRouter = Router();

// 黄果源需管理员开启且该用户被授权
huangguoRouter.use(requireAuth, (req: AuthedRequest, res, next) => {
  if (!userHuangguoAllowed(req.user!.uid))
    return res.status(403).json({ error: "黄果源未对你开放" });
  next();
});

const WIDGET_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

// category → widget 函数
const CATEGORY_FN: Record<string, string> = {
  recommend: "loadRecommend",
  newest: "loadNewest",
  duanju: "loadAiDuanju",
  manju: "loadAiManju",
  huanlian: "loadAiHuanlian",
  mogai: "loadAiMogai",
};
const RANKS: Record<string, true> = { hot: true, recommend: true, potential: true };

interface WidgetListItem {
  id?: string;
  title?: string;
  description?: string;
  posterPath?: string;
  durationText?: string;
  mediaType?: string;
  link?: string;
  detailUrl?: string;
}

interface WidgetEpisode {
  id?: string;
  title?: string;
  episodeNumber?: number;
  url?: string;
}

interface WidgetDetail {
  id?: string;
  title?: string;
  description?: string;
  posterPath?: string;
  mediaType?: string;
  seasons?: {
    name?: string;
    title?: string;
    seasonNumber?: number;
    episodes?: WidgetEpisode[];
  }[];
}

function toMediaItems(raw: unknown): Record<string, unknown>[] {
  // widget 列表函数返回数组或 {items: []}
  const list = Array.isArray(raw) ? raw : (raw as { items?: unknown[] } | null)?.items;
  if (!Array.isArray(list)) return [];
  const out: Record<string, unknown>[] = [];
  for (const it of list as WidgetListItem[]) {
    const id = it?.link || it?.detailUrl || it?.id;
    if (!id || !it.title) continue;
    out.push({
      id,
      title: it.title,
      mediaType: it.mediaType ?? "tv",
      posterUrl: it.posterPath ?? "",
      description: it.description ?? "",
      remark: it.durationText ?? "",
    });
  }
  return out;
}

function wrapStream(url: string): string {
  return `/api/huangguo/stream?u=${encodeURIComponent(url)}`;
}

huangguoRouter.get("/browse", async (req, res) => {
  const category = String(req.query.category ?? "");
  const page = String(Math.max(1, Number(req.query.page) || 1));
  try {
    if (category === "rank") {
      const rank = String(req.query.rank ?? "");
      if (!RANKS[rank]) return res.status(400).json({ error: "非法榜单" });
      const raw = await callWidget("loadRanking", { ranking: rank, page });
      return res.json({ items: toMediaItems(raw) });
    }
    const fn = CATEGORY_FN[category];
    if (!fn) return res.status(400).json({ error: "非法分类" });
    const params: Record<string, unknown> = { page };
    if (["duanju", "manju", "huanlian", "mogai"].includes(category)) params.channel = "latest";
    const raw = await callWidget(fn, params);
    res.json({ items: toMediaItems(raw) });
  } catch {
    res.status(502).json({ error: "上游服务不可用" });
  }
});

huangguoRouter.get("/search", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  const page = String(Math.max(1, Number(req.query.page) || 1));
  if (!q) return res.json({ items: [] });
  try {
    const raw = await callWidget("searchVideos", { keyword: q, page });
    res.json({ items: toMediaItems(raw) });
  } catch {
    res.status(502).json({ error: "上游服务不可用" });
  }
});

huangguoRouter.get("/items/:id", async (req, res) => {
  try {
    const link = decodeURIComponent(req.params.id);
    const d = await callWidget<WidgetDetail>("loadDetail", link);
    const seasons = (d.seasons ?? []).map((s, si) => ({
      id: `season-${si + 1}`,
      title: s.title ?? s.name ?? `第${si + 1}季`,
      seasonNumber: s.seasonNumber ?? si + 1,
      episodes: (s.episodes ?? []).map((e, ei) => ({
        id: e.id ?? `ep-${ei + 1}`,
        title: e.title ?? `第${ei + 1}集`,
        episodeNumber: e.episodeNumber ?? ei + 1,
        // 媒体地址统一走本站代理（m3u8 需重写 playlist，且外站无 CORS）
        streamUrl: e.url ? wrapStream(e.url) : "",
      })),
    }));
    const episodeCount = seasons.reduce((n, s) => n + s.episodes.length, 0);
    res.json({
      id: req.params.id,
      title: d.title ?? "黄果短剧",
      mediaType: d.mediaType ?? "tv",
      posterUrl: d.posterPath ?? "",
      description: d.description ?? "",
      seasonCount: seasons.length,
      episodeCount,
      seasons,
    });
  } catch {
    res.status(502).json({ error: "上游服务不可用" });
  }
});

// m3u8 playlist：重写其中所有分片/子流地址为本站代理
function rewritePlaylist(text: string, base: URL): string {
  const wrap = (uri: string) => {
    try {
      return wrapStream(new URL(uri, base).href);
    } catch {
      return uri;
    }
  };
  return text
    .split("\n")
    .map((line) => {
      const t = line.trim();
      if (!t) return line;
      if (t.startsWith("#")) {
        // EXT-X-KEY / EXT-X-MAP 等的 URI="..." 属性
        return line.replace(/URI="([^"]+)"/g, (_m, uri: string) => `URI="${wrap(uri)}"`);
      }
      return wrap(t);
    })
    .join("\n");
}

// 媒体流代理：mp4 Range 透传；m3u8 拉取重写
huangguoRouter.get("/stream", async (req, res) => {
  let target: string;
  try {
    target = decodeURIComponent(String(req.query.u ?? ""));
  } catch {
    return res.status(400).json({ error: "非法地址" });
  }
  if (!/^https?:\/\//i.test(target)) return res.status(400).json({ error: "非法地址" });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const headers: Record<string, string> = { "User-Agent": WIDGET_UA };
    if (req.headers.range) headers.range = String(req.headers.range);
    const up = await fetch(target, { method: req.method === "HEAD" ? "HEAD" : "GET", headers, signal: ctrl.signal });
    const contentType = up.headers.get("content-type") ?? "";
    const isHls = /mpegurl|m3u8/i.test(contentType) || /\.m3u8(\?|$)/i.test(target);

    if (isHls && up.ok && req.method !== "HEAD") {
      clearTimeout(timer);
      const text = await up.text();
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.setHeader("Cache-Control", "no-store");
      return res.send(rewritePlaylist(text, new URL(target)));
    }

    res.status(up.status);
    for (const name of ["content-type", "content-length", "content-range", "accept-ranges"]) {
      const v = up.headers.get(name);
      if (v) res.setHeader(name, v);
    }
    if (!up.body) return res.end();
    const body = up.body as unknown as ReadableStream;
    const stream = Readable.fromWeb(body);
    // 客户端中断属正常（拖进度条），吞掉防止进程崩溃
    stream.on("error", () => {});
    stream.pipe(res);
    res.on("close", () => {
      clearTimeout(timer);
      ctrl.abort();
    });
  } catch {
    clearTimeout(timer);
    if (!res.headersSent) res.status(502).json({ error: "上游服务不可用" });
  }
});

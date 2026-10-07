import { Router } from "express";
import { Readable } from "node:stream";
import type { ReadableStream } from "node:stream/web";
import { getWidgetSource, userSourceAllowed, updateWidgetSourceMeta, type WidgetSource } from "../db.ts";
import { requireAuth, type AuthedRequest } from "../auth.ts";
import { callWidget, fetchWidgetMeta, type WidgetMeta } from "../widget.ts";

export const widgetsRouter = Router();

const WIDGET_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

interface WidgetListItem {
  id?: string;
  title?: string;
  description?: string;
  posterPath?: string;
  posterUrl?: string;
  durationText?: string;
  remark?: string;
  mediaType?: string;
  link?: string;
  detailUrl?: string;
}

interface WidgetEpisode {
  id?: string;
  title?: string;
  episodeNumber?: number;
  url?: string;
  videoUrl?: string;
}

interface WidgetDetail {
  id?: string;
  title?: string;
  description?: string;
  posterPath?: string;
  posterUrl?: string;
  mediaType?: string;
  seasons?: {
    name?: string;
    title?: string;
    seasonNumber?: number;
    episodes?: WidgetEpisode[];
  }[];
}

// ---- 来源解析 + 权限中间件 ----

interface WidgetRequest extends AuthedRequest {
  widgetSource?: WidgetSource;
  widgetMeta?: WidgetMeta;
}

widgetsRouter.use("/:wid", requireAuth, async (req: WidgetRequest, res, next) => {
  const source = getWidgetSource(req.params.wid);
  if (!source || !source.enabled) return res.status(404).json({ error: "来源不存在或未启用" });
  // 每用户 × 每源授权
  if (!userSourceAllowed(req.user!.uid, source.id, source.nsfw))
    return res.status(403).json({ error: "该来源未对你开放" });
  let meta: WidgetMeta | null = source.meta ? JSON.parse(source.meta) : null;
  if (!meta) {
    // 迁移的旧来源可能没 meta，惰性补一次
    try {
      meta = await fetchWidgetMeta(source.url);
      updateWidgetSourceMeta(source.id, meta);
    } catch {
      meta = { label: source.label, categories: [], searchFn: null, ranks: [] };
    }
  }
  req.widgetSource = source;
  req.widgetMeta = meta;
  next();
});

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
      posterUrl: it.posterUrl ?? it.posterPath ?? "",
      description: it.description ?? "",
      remark: it.remark ?? it.durationText ?? "",
    });
  }
  return out;
}

const wrapStream = (wid: string, url: string) =>
  `/api/widgets/${wid}/stream?u=${encodeURIComponent(url)}`;

widgetsRouter.get("/:wid/browse", async (req: WidgetRequest, res) => {
  const meta = req.widgetMeta!;
  const wid = req.widgetSource!.id;
  const category = String(req.query.category ?? "");
  const page = String(Math.max(1, Number(req.query.page) || 1));
  try {
    if (category === "rank") {
      const rank = String(req.query.rank ?? "");
      if (!meta.ranks.some((r) => r.id === rank))
        return res.status(400).json({ error: "非法榜单" });
      const raw = await callWidget(wid, "loadRanking", { ranking: rank, page });
      return res.json({ items: toMediaItems(raw) });
    }
    const cat = meta.categories.find((c) => c.id === category);
    if (!cat) return res.status(400).json({ error: "非法分类" });
    const raw = await callWidget(wid, cat.fn, { ...cat.consts, page });
    res.json({ items: toMediaItems(raw) });
  } catch {
    res.status(502).json({ error: "上游服务不可用" });
  }
});

widgetsRouter.get("/:wid/search", async (req: WidgetRequest, res) => {
  const meta = req.widgetMeta!;
  const wid = req.widgetSource!.id;
  const q = String(req.query.q ?? "").trim();
  const page = String(Math.max(1, Number(req.query.page) || 1));
  if (!q || !meta.searchFn) return res.json({ items: [] });
  try {
    const raw = await callWidget(wid, meta.searchFn, { keyword: q, page });
    res.json({ items: toMediaItems(raw) });
  } catch {
    res.status(502).json({ error: "上游服务不可用" });
  }
});

widgetsRouter.get("/:wid/items/:id", async (req: WidgetRequest, res) => {
  const wid = req.widgetSource!.id;
  try {
    const link = decodeURIComponent(req.params.id);
    const d = await callWidget<WidgetDetail>(wid, "loadDetail", link);
    const seasons = (d.seasons ?? []).map((s, si) => ({
      id: `season-${si + 1}`,
      title: s.title ?? s.name ?? `第${si + 1}季`,
      seasonNumber: s.seasonNumber ?? si + 1,
      episodes: (s.episodes ?? []).map((e, ei) => {
        const url = e.url ?? e.videoUrl ?? "";
        return {
          id: e.id ?? `ep-${ei + 1}`,
          title: e.title ?? `第${ei + 1}集`,
          episodeNumber: e.episodeNumber ?? ei + 1,
          // 媒体地址统一走本站代理（m3u8 需重写 playlist，且外站无 CORS）
          streamUrl: url ? wrapStream(wid, url) : "",
        };
      }),
    }));
    const episodeCount = seasons.reduce((n, s) => n + s.episodes.length, 0);
    res.json({
      id: req.params.id,
      title: d.title ?? req.widgetSource!.label,
      mediaType: d.mediaType ?? "tv",
      posterUrl: d.posterUrl ?? d.posterPath ?? "",
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
function rewritePlaylist(text: string, base: URL, wid: string): string {
  const wrap = (uri: string) => {
    try {
      return wrapStream(wid, new URL(uri, base).href);
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
widgetsRouter.get("/:wid/stream", async (req: WidgetRequest, res) => {
  const wid = req.widgetSource!.id;
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
      return res.send(rewritePlaylist(text, new URL(target), wid));
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

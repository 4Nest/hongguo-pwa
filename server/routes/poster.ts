import { Router } from "express";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { DATA_DIR } from "../config.ts";
import { requireAuth } from "../auth.ts";

export const posterRouter = Router();
posterRouter.use(requireAuth);

// 海报代理 + 磁盘缓存：手机只连本站；缓存避免重复拉上游导致浏览器连接饥饿
const POSTER_CACHE_DIR = path.join(DATA_DIR, "poster-cache");
fs.mkdirSync(POSTER_CACHE_DIR, { recursive: true });
// 启动时清理：超 500 个文件删最旧
{
  const files = fs.readdirSync(POSTER_CACHE_DIR).filter((f) => f.endsWith(".bin"));
  if (files.length > 500) {
    const sorted = files
      .map((f) => ({ f, mtime: fs.statSync(path.join(POSTER_CACHE_DIR, f)).mtimeMs }))
      .sort((a, b) => a.mtime - b.mtime);
    for (const { f } of sorted.slice(0, files.length - 500)) {
      fs.rmSync(path.join(POSTER_CACHE_DIR, f), { force: true });
      fs.rmSync(path.join(POSTER_CACHE_DIR, f.replace(/\.bin$/, ".ct")), { force: true });
    }
  }
}

posterRouter.get("/", async (req, res) => {
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

  // 命中磁盘缓存直接返回
  const key = crypto.createHash("sha256").update(target).digest("hex");
  const binFile = path.join(POSTER_CACHE_DIR, `${key}.bin`);
  const ctFile = path.join(POSTER_CACHE_DIR, `${key}.ct`);
  if (fs.existsSync(binFile)) {
    res.setHeader("Content-Type", fs.existsSync(ctFile) ? fs.readFileSync(ctFile, "utf8") : "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");
    return fs.createReadStream(binFile).pipe(res);
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const up = await fetch(target, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!up.ok) return res.status(502).json({ error: "上游服务不可用" });
    // 海报几百 KB，直接读入内存后写缓存再响应（比 tee 流简单可靠）
    const buf = Buffer.from(await up.arrayBuffer());
    const ct = up.headers.get("content-type") ?? "image/jpeg";
    fs.writeFileSync(binFile, buf);
    fs.writeFileSync(ctFile, ct);
    res.setHeader("Content-Type", ct);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("Content-Length", String(buf.length));
    res.send(buf);
  } catch {
    clearTimeout(timer);
    if (!res.headersSent) res.status(502).json({ error: "上游服务不可用" });
  }
});

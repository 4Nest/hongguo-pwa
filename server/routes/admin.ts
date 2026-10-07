import { Router } from "express";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import {
  db,
  getSetting,
  setSetting,
  getUpstreamUrl,
  listWidgetSources,
  getWidgetSource,
  upsertWidgetSource,
  deleteWidgetSource,
  setUserSourceAccess,
  userSourceAllowed,
} from "../db.ts";
import { requireAdmin, type AuthedRequest } from "../auth.ts";
import { resetWidget, fetchWidgetMeta } from "../widget.ts";


export const adminRouter = Router();
adminRouter.use(requireAdmin);

// ---- 全局设置 ----

adminRouter.get("/settings", (_req, res) => {
  res.json({
    huangguoEnabled: getSetting("huangguo_enabled") === "1",
    upstreamUrl: getUpstreamUrl(),
  });
});

adminRouter.put("/settings", (req, res) => {
  const { huangguoEnabled, upstreamUrl } = req.body ?? {};
  if (huangguoEnabled !== undefined) {
    if (typeof huangguoEnabled !== "boolean")
      return res.status(400).json({ error: "huangguoEnabled 须为布尔值" });
    setSetting("huangguo_enabled", huangguoEnabled ? "1" : "0");
    // 同步到迁移后的 huangguo 来源开关
    const hg = getWidgetSource("huangguo");
    if (hg) upsertWidgetSource({ ...hg, enabled: huangguoEnabled ? 1 : 0 });
  }
  if (upstreamUrl !== undefined) {
    if (typeof upstreamUrl !== "string" || !/^https?:\/\/\S+$/.test(upstreamUrl.trim()))
      return res.status(400).json({ error: "上游地址须为 http(s) URL" });
    setSetting("upstream_url", upstreamUrl.trim().replace(/\/$/, ""));
    // 内置红果源直接读设置；迁移的 huangguo 来源地址如仍是默认推导值则跟随更新
    const hg = getWidgetSource("huangguo");
    if (hg && /\/widgets\/huangguo\.js$/.test(hg.url)) {
      upsertWidgetSource({ ...hg, url: `${getUpstreamUrl()}/widgets/huangguo.js` });
      resetWidget("huangguo");
    }
  }
  res.json({
    ok: true,
    huangguoEnabled: getSetting("huangguo_enabled") === "1",
    upstreamUrl: getUpstreamUrl(),
  });
});

// ---- 来源管理（粘贴 Capy 页面的 widget 链接即可添加） ----

adminRouter.get("/sources", (_req, res) => {
  res.json({ sources: listWidgetSources() });
});

adminRouter.post("/sources", async (req, res) => {
  const { url, nsfw } = req.body ?? {};
  if (typeof url !== "string" || !/^https?:\/\/\S+$/.test(url.trim()))
    return res.status(400).json({ error: "来源须为 http(s) URL" });
  const clean = url.trim();
  if (listWidgetSources().some((s) => s.url === clean))
    return res.status(400).json({ error: "该来源已存在" });
  let meta;
  try {
    meta = await fetchWidgetMeta(clean);
  } catch (err) {
    return res.status(400).json({
      error: `无法获取来源信息：${err instanceof Error ? err.message : "网络错误"}`,
    });
  }
  // id 取 URL 文件名（/widgets/dsd.js → dsd），冲突加后缀
  const base =
    (clean.match(/\/([^/?]+)\.js(?:\?|$)/)?.[1] ?? "source")
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "") || "source";
  let id = base;
  for (let i = 2; getWidgetSource(id); i++) id = `${base}-${i}`;
  // 默认对全部用户开放；成人内容添加后在列表里打开「成人」标记
  upsertWidgetSource({
    id,
    url: clean,
    label: meta.label,
    enabled: 1,
    nsfw: nsfw === true ? 1 : 0,
    meta: JSON.stringify(meta),
  });
  resetWidget(id);
  res.json({ ok: true, source: getWidgetSource(id) });
});

adminRouter.put("/sources/:id", (req, res) => {
  const source = getWidgetSource(req.params.id);
  if (!source) return res.status(404).json({ error: "来源不存在" });
  const { enabled, label, nsfw } = req.body ?? {};
  if (enabled !== undefined && typeof enabled !== "boolean")
    return res.status(400).json({ error: "enabled 须为布尔值" });
  if (nsfw !== undefined && typeof nsfw !== "boolean")
    return res.status(400).json({ error: "nsfw 须为布尔值" });
  if (label !== undefined && (typeof label !== "string" || !label.trim()))
    return res.status(400).json({ error: "名称不能为空" });
  upsertWidgetSource({
    ...source,
    label: label?.trim() ?? source.label,
    enabled: enabled === undefined ? source.enabled : enabled ? 1 : 0,
    nsfw: nsfw === undefined ? source.nsfw : nsfw ? 1 : 0,
  });
  if (label !== undefined) resetWidget(source.id);
  res.json({ ok: true, source: getWidgetSource(source.id) });
});

adminRouter.delete("/sources/:id", (req, res) => {
  const source = getWidgetSource(req.params.id);
  if (!source) return res.status(404).json({ error: "来源不存在" });
  deleteWidgetSource(source.id);
  resetWidget(source.id);
  res.json({ ok: true });
});

function genCode(): string {
  for (let i = 0; i < 10; i++) {
    const code = crypto.randomBytes(5).toString("hex").slice(0, 8);
    const exists = db.prepare("SELECT 1 FROM invites WHERE code = ?").get(code);
    if (!exists) return code;
  }
  return crypto.randomBytes(8).toString("hex").slice(0, 8);
}

adminRouter.post("/invites", (req: AuthedRequest, res) => {
  const count = Number(req.body?.count ?? 1);
  if (!Number.isInteger(count) || count < 1 || count > 50)
    return res.status(400).json({ error: "数量须为 1-50 的整数" });
  const { expiresInDays } = req.body ?? {};
  const expiresAt =
    typeof expiresInDays === "number" && expiresInDays > 0
      ? Date.now() + Math.floor(expiresInDays * 86400 * 1000)
      : null;
  const codes: string[] = [];
  const insert = db.prepare(
    "INSERT INTO invites (code, created_by, created_at, expires_at) VALUES (?, ?, ?, ?)",
  );
  const tx = db.transaction(() => {
    for (let i = 0; i < count; i++) {
      const code = genCode();
      insert.run(code, req.user!.uid, Date.now(), expiresAt);
      codes.push(code);
    }
  });
  tx();
  res.json({ codes });
});

adminRouter.get("/invites", (_req, res) => {
  const rows = db
    .prepare(
      `SELECT i.code, i.created_at, i.used_at, i.expires_at, u.username AS used_by_username
       FROM invites i LEFT JOIN users u ON u.id = i.used_by
       ORDER BY i.created_at DESC`,
    )
    .all();
  res.json({ invites: rows });
});

// 删除邀请码：已使用的也可删（只影响记录，不影响已注册用户）
adminRouter.delete("/invites/:code", (req, res) => {
  const invite = db.prepare("SELECT 1 FROM invites WHERE code = ?").get(req.params.code);
  if (!invite) return res.status(404).json({ error: "邀请码不存在" });
  db.prepare("DELETE FROM invites WHERE code = ?").run(req.params.code);
  res.json({ ok: true });
});

adminRouter.get("/users", (_req, res) => {
  const rows = db
    .prepare(
      `SELECT u.id, u.username, u.role, u.created_at, u.huangguo_allowed, u.expires_at,
        (SELECT COUNT(*) FROM favorites f WHERE f.user_id = u.id) AS favorite_count,
        (SELECT COUNT(*) FROM history h WHERE h.user_id = u.id) AS history_count
       FROM users u ORDER BY u.created_at ASC`,
    )
    .all();
  res.json({ users: rows });
});

// 某用户的每源授权列表（effective = 显式设置优先，默认 admin 全通/非成人开放）
adminRouter.get("/users/:id/sources", (req, res) => {
  const id = Number(req.params.id);
  const target = db.prepare("SELECT id, role FROM users WHERE id = ?").get(id) as
    | { id: number; role: string }
    | undefined;
  if (!target) return res.status(404).json({ error: "用户不存在" });
  const rows = listWidgetSources().map((s) => ({
    id: s.id,
    label: s.label,
    nsfw: s.nsfw === 1,
    enabled: s.enabled === 1,
    allowed: userSourceAllowed(id, s.id, s.nsfw),
  }));
  res.json({ sources: rows });
});

// 设置某用户对某源的授权
adminRouter.put("/users/:id/sources/:sid", (req, res) => {
  const id = Number(req.params.id);
  const { allowed } = req.body ?? {};
  if (typeof allowed !== "boolean") return res.status(400).json({ error: "参数不完整" });
  const target = db.prepare("SELECT id FROM users WHERE id = ?").get(id);
  if (!target) return res.status(404).json({ error: "用户不存在" });
  if (!getWidgetSource(req.params.sid)) return res.status(404).json({ error: "来源不存在" });
  setUserSourceAccess(id, req.params.sid, allowed);
  res.json({ ok: true, allowed });
});

// 设置账号有效期：days 天数（0/负数=永久）
adminRouter.put("/users/:id/expires", (req, res) => {
  const id = Number(req.params.id);
  const { days } = req.body ?? {};
  if (typeof days !== "number" || !Number.isFinite(days))
    return res.status(400).json({ error: "参数不完整" });
  const target = db.prepare("SELECT id FROM users WHERE id = ?").get(id);
  if (!target) return res.status(404).json({ error: "用户不存在" });
  const expiresAt = days > 0 ? Date.now() + Math.floor(days * 86400 * 1000) : null;
  db.prepare("UPDATE users SET expires_at = ? WHERE id = ?").run(expiresAt, id);
  res.json({ ok: true, expiresAt });
});

adminRouter.delete("/users/:id", (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const me = req.user!.uid;
  const target = db.prepare("SELECT id, role FROM users WHERE id = ?").get(id) as
    | { id: number; role: string }
    | undefined;
  if (!target) return res.status(404).json({ error: "用户不存在" });
  if (id === me) return res.status(400).json({ error: "不能删除自己" });
  if (target.role === "admin") return res.status(400).json({ error: "不能删除管理员" });
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM favorites WHERE user_id = ?").run(id);
    db.prepare("DELETE FROM history WHERE user_id = ?").run(id);
    db.prepare("DELETE FROM users WHERE id = ?").run(id);
  });
  tx();
  res.json({ ok: true });
});

adminRouter.post("/users", (req, res) => {
  const { username, password, role, expiresInDays } = req.body ?? {};
  if (typeof username !== "string" || typeof password !== "string")
    return res.status(400).json({ error: "参数不完整" });
  const name = username.trim();
  if (!name || name.length > 32 || password.length < 6)
    return res.status(400).json({ error: "用户名不能为空且密码至少 6 位" });
  if (role !== undefined && role !== "user" && role !== "admin")
    return res.status(400).json({ error: "非法角色" });
  const exists = db.prepare("SELECT 1 FROM users WHERE username = ?").get(name);
  if (exists) return res.status(400).json({ error: "用户名已被占用" });
  const expiresAt =
    typeof expiresInDays === "number" && expiresInDays > 0
      ? Date.now() + Math.floor(expiresInDays * 86400 * 1000)
      : null;
  // 新建用户默认禁止黄果，管理员在用户列表单独开启
  const info = db
    .prepare(
      "INSERT INTO users (username, password_hash, role, created_at, huangguo_allowed, expires_at) VALUES (?, ?, ?, ?, 0, ?)",
    )
    .run(name, bcrypt.hashSync(password, 10), role === "admin" ? "admin" : "user", Date.now(), expiresAt);
  res.json({ id: Number(info.lastInsertRowid), username: name });
});

adminRouter.post("/users/:id/password", (req, res) => {
  const id = Number(req.params.id);
  const { password } = req.body ?? {};
  if (typeof password !== "string" || password.length < 6)
    return res.status(400).json({ error: "密码至少 6 位" });
  const target = db.prepare("SELECT id FROM users WHERE id = ?").get(id);
  if (!target) return res.status(404).json({ error: "用户不存在" });
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
    bcrypt.hashSync(password, 10),
    id,
  );
  res.json({ ok: true });
});

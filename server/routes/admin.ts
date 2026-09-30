import { Router } from "express";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { db, getSetting, setSetting, getUpstreamUrl } from "../db.ts";
import { requireAdmin, type AuthedRequest } from "../auth.ts";
import { resetWidget } from "../widget.ts";


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
  }
  if (upstreamUrl !== undefined) {
    if (typeof upstreamUrl !== "string" || !/^https?:\/\/\S+$/.test(upstreamUrl.trim()))
      return res.status(400).json({ error: "上游地址须为 http(s) URL" });
    setSetting("upstream_url", upstreamUrl.trim().replace(/\/$/, ""));
    // 黄果 widget 脚本内写死了 capy 地址，重建沙箱
    resetWidget();
  }
  res.json({
    ok: true,
    huangguoEnabled: getSetting("huangguo_enabled") === "1",
    upstreamUrl: getUpstreamUrl(),
  });
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

// 单独设置某用户的黄果权限
adminRouter.put("/users/:id/huangguo", (req, res) => {
  const id = Number(req.params.id);
  const { allowed } = req.body ?? {};
  if (typeof allowed !== "boolean") return res.status(400).json({ error: "参数不完整" });
  const target = db.prepare("SELECT id FROM users WHERE id = ?").get(id);
  if (!target) return res.status(404).json({ error: "用户不存在" });
  db.prepare("UPDATE users SET huangguo_allowed = ? WHERE id = ?").run(allowed ? 1 : 0, id);
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

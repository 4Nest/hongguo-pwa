import { Router } from "express";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "../db.ts";
import { requireAdmin, type AuthedRequest } from "../auth.ts";

export const adminRouter = Router();
adminRouter.use(requireAdmin);

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
  const codes: string[] = [];
  const insert = db.prepare("INSERT INTO invites (code, created_by, created_at) VALUES (?, ?, ?)");
  const tx = db.transaction(() => {
    for (let i = 0; i < count; i++) {
      const code = genCode();
      insert.run(code, req.user!.uid, Date.now());
      codes.push(code);
    }
  });
  tx();
  res.json({ codes });
});

adminRouter.get("/invites", (_req, res) => {
  const rows = db
    .prepare(
      `SELECT i.code, i.created_at, i.used_at, u.username AS used_by_username
       FROM invites i LEFT JOIN users u ON u.id = i.used_by
       ORDER BY i.created_at DESC`,
    )
    .all();
  res.json({ invites: rows });
});

adminRouter.delete("/invites/:code", (req, res) => {
  const invite = db.prepare("SELECT used_by FROM invites WHERE code = ?").get(req.params.code) as
    | { used_by: number | null }
    | undefined;
  if (!invite) return res.status(404).json({ error: "邀请码不存在" });
  if (invite.used_by !== null) return res.status(400).json({ error: "已使用的邀请码不能删除" });
  db.prepare("DELETE FROM invites WHERE code = ?").run(req.params.code);
  res.json({ ok: true });
});

adminRouter.get("/users", (_req, res) => {
  const rows = db
    .prepare(
      `SELECT u.id, u.username, u.role, u.created_at,
        (SELECT COUNT(*) FROM favorites f WHERE f.user_id = u.id) AS favorite_count,
        (SELECT COUNT(*) FROM history h WHERE h.user_id = u.id) AS history_count
       FROM users u ORDER BY u.created_at ASC`,
    )
    .all();
  res.json({ users: rows });
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
  const { username, password, role } = req.body ?? {};
  if (typeof username !== "string" || typeof password !== "string")
    return res.status(400).json({ error: "参数不完整" });
  const name = username.trim();
  if (!name || name.length > 32 || password.length < 6)
    return res.status(400).json({ error: "用户名不能为空且密码至少 6 位" });
  if (role !== undefined && role !== "user" && role !== "admin")
    return res.status(400).json({ error: "非法角色" });
  const exists = db.prepare("SELECT 1 FROM users WHERE username = ?").get(name);
  if (exists) return res.status(400).json({ error: "用户名已被占用" });
  const info = db
    .prepare("INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)")
    .run(name, bcrypt.hashSync(password, 10), role === "admin" ? "admin" : "user", Date.now());
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

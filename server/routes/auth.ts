import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, huangguoEnabled, userHuangguoAllowed } from "../db.ts";
import { signToken, clearToken, requireAuth, type AuthedRequest } from "../auth.ts";

export const authRouter = Router();

const getUserByName = db.prepare("SELECT * FROM users WHERE username = ?");

authRouter.post("/register", (req, res) => {
  const { username, password, inviteCode } = req.body ?? {};
  if (typeof username !== "string" || typeof password !== "string" || typeof inviteCode !== "string")
    return res.status(400).json({ error: "参数不完整" });
  const name = username.trim();
  if (!name || name.length > 32 || password.length < 6)
    return res.status(400).json({ error: "用户名不能为空且密码至少 6 位" });

  const invite = db.prepare("SELECT * FROM invites WHERE code = ?").get(inviteCode.trim()) as
    | { code: string; used_by: number | null; expires_at: number | null }
    | undefined;
  if (!invite || invite.used_by !== null)
    return res.status(400).json({ error: "邀请码无效或已使用" });
  if (invite.expires_at !== null && invite.expires_at < Date.now())
    return res.status(400).json({ error: "邀请码已过期" });
  if (getUserByName.get(name)) return res.status(400).json({ error: "用户名已被占用" });

  const hash = bcrypt.hashSync(password, 10);
  const now = Date.now();
  const tx = db.transaction(() => {
    const info = db
      .prepare("INSERT INTO users (username, password_hash, role, created_at, huangguo_allowed) VALUES (?, ?, 'user', ?, 0)")
      .run(name, hash, now);
    const uid = Number(info.lastInsertRowid);
    db.prepare("UPDATE invites SET used_by = ?, used_at = ? WHERE code = ?").run(uid, now, invite.code);
    return uid;
  });
  const uid = tx();
  signToken(req, res, uid, "user");
  res.json({ id: uid, username: name, role: "user" });
});

authRouter.post("/login", (req, res) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== "string" || typeof password !== "string")
    return res.status(400).json({ error: "参数不完整" });
  const user = getUserByName.get(username.trim()) as
    | { id: number; username: string; password_hash: string; role: string; expires_at: number | null }
    | undefined;
  if (!user || !bcrypt.compareSync(password, user.password_hash))
    return res.status(401).json({ error: "用户名或密码错误" });
  if (user.expires_at !== null && user.expires_at < Date.now())
    return res.status(403).json({ error: "账号已过期，请联系管理员" });
  signToken(req, res, user.id, user.role);
  res.json({ id: user.id, username: user.username, role: user.role });
});
authRouter.post("/logout", (req, res) => {
  clearToken(req, res);
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, (req: AuthedRequest, res) => {
  const user = db
    .prepare("SELECT id, username, role, source, expires_at FROM users WHERE id = ?")
    .get(req.user!.uid) as
    | { id: number; username: string; role: string; source: string; expires_at: number | null }
    | undefined;
  if (!user) return res.status(401).json({ error: "用户不存在" });
  // 账号过期：清 cookie 并踢出
  if (user.expires_at !== null && user.expires_at < Date.now()) {
    clearToken(req, res);
    return res.status(401).json({ error: "账号已过期" });
  }
  // 黄果被关闭或该用户被单独禁用时，已切到黄果的用户回退红果
  const allowed = userHuangguoAllowed(user.id);
  if (user.source === "huangguo" && !allowed) {
    db.prepare("UPDATE users SET source = 'hongguo' WHERE id = ?").run(user.id);
    user.source = "hongguo";
  }
  res.json({ ...user, huangguoEnabled: huangguoEnabled(), huangguoAllowed: allowed });
});

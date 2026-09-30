import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, userHuangguoAllowed } from "../db.ts";
import { requireAuth, type AuthedRequest } from "../auth.ts";


export const meRouter = Router();
meRouter.use(requireAuth);

// 切换数据源（红果/黄果）；黄果需管理员开启
meRouter.post("/source", (req: AuthedRequest, res) => {
  const { source } = req.body ?? {};
  if (source !== "hongguo" && source !== "huangguo")
    return res.status(400).json({ error: "非法数据源" });
  if (source === "huangguo" && !userHuangguoAllowed(req.user!.uid))
    return res.status(403).json({ error: "黄果源未对你开放" });
  db.prepare("UPDATE users SET source = ? WHERE id = ?").run(source, req.user!.uid);
  res.json({ ok: true, source });
});

meRouter.get("/favorites", (req: AuthedRequest, res) => {
  const rows = db
    .prepare(
      `SELECT item_id AS itemId, title, poster_url AS posterUrl, remark, media_type AS mediaType, source, created_at AS createdAt
       FROM favorites WHERE user_id = ? ORDER BY created_at DESC`,
    )
    .all(req.user!.uid);
  res.json({ favorites: rows });
});

meRouter.post("/favorites", (req: AuthedRequest, res) => {
  const { itemId, title, posterUrl, remark, mediaType, source } = req.body ?? {};
  if (typeof itemId !== "string" || typeof title !== "string" || !itemId || !title)
    return res.status(400).json({ error: "参数不完整" });
  db.prepare(
    `INSERT OR REPLACE INTO favorites (user_id, item_id, title, poster_url, remark, media_type, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    req.user!.uid,
    itemId,
    title,
    typeof posterUrl === "string" ? posterUrl : null,
    typeof remark === "string" ? remark : null,
    typeof mediaType === "string" ? mediaType : null,
    source === "huangguo" ? "huangguo" : "hongguo",
    Date.now(),
  );
  res.json({ ok: true });
});

meRouter.delete("/favorites/:itemId", (req: AuthedRequest, res) => {
  db.prepare("DELETE FROM favorites WHERE user_id = ? AND item_id = ?").run(
    req.user!.uid,
    req.params.itemId,
  );
  res.json({ ok: true });
});

meRouter.get("/history", (req: AuthedRequest, res) => {
  const rows = db
    .prepare(
      `SELECT item_id AS itemId, title, poster_url AS posterUrl, episode_id AS episodeId,
              episode_number AS episodeNumber, position_sec AS positionSec, source, updated_at AS updatedAt
       FROM history WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50`,
    )
    .all(req.user!.uid);
  res.json({ history: rows });
});

meRouter.post("/history", (req: AuthedRequest, res) => {
  const { itemId, title, posterUrl, episodeId, episodeNumber, positionSec, source } = req.body ?? {};
  if (typeof itemId !== "string" || typeof title !== "string" || !itemId || !title)
    return res.status(400).json({ error: "参数不完整" });
  db.prepare(
    `INSERT OR REPLACE INTO history (user_id, item_id, title, poster_url, episode_id, episode_number, position_sec, source, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    req.user!.uid,
    itemId,
    title,
    typeof posterUrl === "string" ? posterUrl : null,
    typeof episodeId === "string" ? episodeId : null,
    typeof episodeNumber === "number" ? episodeNumber : null,
    typeof positionSec === "number" ? positionSec : null,
    source === "huangguo" ? "huangguo" : "hongguo",
    Date.now(),
  );
  res.json({ ok: true });
});

meRouter.delete("/history/:itemId", (req: AuthedRequest, res) => {
  db.prepare("DELETE FROM history WHERE user_id = ? AND item_id = ?").run(
    req.user!.uid,
    req.params.itemId,
  );
  res.json({ ok: true });
});

meRouter.post("/password", (req: AuthedRequest, res) => {
  const { oldPassword, newPassword } = req.body ?? {};
  if (typeof oldPassword !== "string" || typeof newPassword !== "string" || newPassword.length < 6)
    return res.status(400).json({ error: "新密码至少 6 位" });
  const user = db
    .prepare("SELECT password_hash FROM users WHERE id = ?")
    .get(req.user!.uid) as { password_hash: string } | undefined;
  if (!user || !bcrypt.compareSync(oldPassword, user.password_hash))
    return res.status(400).json({ error: "原密码错误" });
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
    bcrypt.hashSync(newPassword, 10),
    req.user!.uid,
  );
  res.json({ ok: true });
});

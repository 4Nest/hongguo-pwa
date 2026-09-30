import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./config.ts";

export const db = new Database(path.join(DATA_DIR, "app.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS invites (
  code TEXT PRIMARY KEY,
  created_by INTEGER,
  used_by INTEGER,
  used_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS favorites (
  user_id INTEGER NOT NULL,
  item_id TEXT NOT NULL,
  title TEXT NOT NULL,
  poster_url TEXT,
  remark TEXT,
  media_type TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, item_id)
);
CREATE TABLE IF NOT EXISTS history (
  user_id INTEGER NOT NULL,
  item_id TEXT NOT NULL,
  title TEXT NOT NULL,
  poster_url TEXT,
  episode_id TEXT,
  episode_number INTEGER,
  position_sec REAL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, item_id)
);
`);

// 首次启动：无 admin 则创建随机密码 admin，明文只打印一次并写入 data/admin-credentials.txt
const adminRow = db
  .prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1")
  .get();
if (!adminRow) {
  const password = crypto.randomBytes(9).toString("base64url");
  const hash = bcrypt.hashSync(password, 10);
  db.prepare(
    "INSERT INTO users (username, password_hash, role, created_at) VALUES ('admin', ?, 'admin', ?)",
  ).run(hash, Date.now());
  const credFile = path.join(DATA_DIR, "admin-credentials.txt");
  fs.writeFileSync(
    credFile,
    `红果短剧初始管理员账号\n用户名: admin\n密码: ${password}\n（此文件仅在首次创建 admin 时生成，忘记密码请删除 data/app.db 后重启重建）\n`,
    { mode: 0o600 },
  );
  console.log("===============================================");
  console.log("[init] 已创建管理员账号 admin");
  console.log(`[init] 初始密码: ${password}`);
  console.log(`[init] 凭证已写入 ${credFile}`);
  console.log("===============================================");
}

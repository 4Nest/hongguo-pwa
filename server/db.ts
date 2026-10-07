import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, DEFAULT_UPSTREAM_URL } from "./config.ts";

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

// 全局设置（黄果源开关等）
db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

// 用户数据源偏好（hongguo|huangguo）
try {
  db.exec("ALTER TABLE users ADD COLUMN source TEXT NOT NULL DEFAULT 'hongguo'");
} catch {
  // 列已存在
}

export function getSetting(key: string): string | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string) {
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
}

export function huangguoEnabled(): boolean {
  return getSetting("huangguo_enabled") === "1";
}

/** 上游 Capy Backend 地址：管理面板可改，默认取 env 或内置值（内置红果源使用） */
export function getUpstreamUrl(): string {
  return getSetting("upstream_url") ?? DEFAULT_UPSTREAM_URL;
}

// ---- widget 来源（粘贴 Capy 页面的 widget 链接即可添加的扩展源）----

db.exec(`
CREATE TABLE IF NOT EXISTS widget_sources (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  nsfw INTEGER NOT NULL DEFAULT 1,
  meta TEXT,
  created_at INTEGER NOT NULL
);
`);

// nsfw 列（1=成人内容，需用户被授权才能用；老库补充）
try {
  db.exec("ALTER TABLE widget_sources ADD COLUMN nsfw INTEGER NOT NULL DEFAULT 1");
} catch {
  // 列已存在
}

// 每用户 × 每源授权（无记录时按默认策略：非成人源开放、成人源仅 admin）
db.exec(`
CREATE TABLE IF NOT EXISTS user_source_access (
  user_id INTEGER NOT NULL,
  source_id TEXT NOT NULL,
  allowed INTEGER NOT NULL,
  PRIMARY KEY (user_id, source_id)
);
`);

export function setUserSourceAccess(uid: number, sourceId: string, allowed: boolean) {
  db.prepare(
    "INSERT OR REPLACE INTO user_source_access (user_id, source_id, allowed) VALUES (?, ?, ?)",
  ).run(uid, sourceId, allowed ? 1 : 0);
}

/** 该用户能否使用某源：显式设置优先；默认 admin 全通、非成人源开放、成人源拒绝 */
export function userSourceAllowed(uid: number, sourceId: string, nsfw: number): boolean {
  const row = db
    .prepare(
      `SELECT u.role, a.allowed FROM users u
       LEFT JOIN user_source_access a ON a.user_id = u.id AND a.source_id = ?
       WHERE u.id = ?`,
    )
    .get(sourceId, uid) as { role: string; allowed: number | null } | undefined;
  if (!row) return false;
  if (row.allowed !== null) return row.allowed === 1;
  if (row.role === "admin") return true;
  return nsfw !== 1;
}

export interface WidgetSource {
  id: string;
  url: string;
  label: string;
  enabled: number;
  nsfw: number;
  meta: string | null;
  created_at: number;
}

export function listWidgetSources(): WidgetSource[] {
  return db
    .prepare("SELECT * FROM widget_sources ORDER BY nsfw ASC, created_at ASC")
    .all() as WidgetSource[];
}

export function getWidgetSource(id: string): WidgetSource | undefined {
  return db.prepare("SELECT * FROM widget_sources WHERE id = ?").get(id) as
    | WidgetSource
    | undefined;
}

export function upsertWidgetSource(s: {
  id: string;
  url: string;
  label: string;
  enabled?: number;
  nsfw?: number;
  meta?: string | null;
}) {
  db.prepare(
    `INSERT INTO widget_sources (id, url, label, enabled, nsfw, meta, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET url=excluded.url, label=excluded.label,
       enabled=COALESCE(excluded.enabled, widget_sources.enabled),
       nsfw=COALESCE(excluded.nsfw, widget_sources.nsfw),
       meta=COALESCE(excluded.meta, widget_sources.meta)`,
  ).run(s.id, s.url, s.label, s.enabled ?? 1, s.nsfw ?? 1, s.meta ?? null, Date.now());
}

export function deleteWidgetSource(id: string) {
  db.prepare("DELETE FROM widget_sources WHERE id = ?").run(id);
}

export function updateWidgetSourceMeta(id: string, meta: unknown) {
  db.prepare("UPDATE widget_sources SET meta = ? WHERE id = ?").run(JSON.stringify(meta), id);
}

// 迁移：空表时把旧「自定义上游地址 + 黄果开关」变成第一条来源（…/widgets/huangguo.js）
if (listWidgetSources().length === 0) {
  upsertWidgetSource({
    id: "huangguo",
    url: `${getUpstreamUrl()}/widgets/huangguo.js`,
    label: "黄果短剧",
    enabled: huangguoEnabled() ? 1 : 0,
    nsfw: 1,
  });
}

// 收藏/历史记录数据源（黄果 id 是 URL，跨源必须记录来源）
for (const table of ["favorites", "history"]) {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN source TEXT NOT NULL DEFAULT 'hongguo'`);
  } catch {
    // 列已存在
  }
}

// 每用户黄果权限（1=允许，默认允许；管理员可单独关闭）
try {
  db.exec("ALTER TABLE users ADD COLUMN huangguo_allowed INTEGER NOT NULL DEFAULT 1");
} catch {
  // 列已存在
}

/** 该用户是否被授权使用成人内容源（仅看按用户开关；源是否需授权由 nsfw 列决定） */
export function userNsfwAllowed(uid: number): boolean {
  const row = db.prepare("SELECT huangguo_allowed FROM users WHERE id = ?").get(uid) as
    | { huangguo_allowed: number }
    | undefined;
  return row?.huangguo_allowed === 1;
}

// 账号有效期（NULL=永久；过期拒绝登录）
try {
  db.exec("ALTER TABLE users ADD COLUMN expires_at INTEGER");
} catch {
  // 列已存在
}

// 邀请码有效期（NULL=永久；过期不可用于注册）
try {
  db.exec("ALTER TABLE invites ADD COLUMN expires_at INTEGER");
} catch {
  // 列已存在
}

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

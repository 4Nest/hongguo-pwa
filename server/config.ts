import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const PORT = Number(process.env.PORT || 8789);
// 上游默认值：仅作为 settings 表未配置时的初始值；运行时以后台设置为准
export const DEFAULT_UPSTREAM_URL = (
  process.env.UPSTREAM_URL || "http://192.168.2.110:8788"
).replace(/\/$/, "");
export const DATA_DIR = path.resolve(process.env.DATA_DIR || "./data");
export const IS_PROD = process.env.NODE_ENV === "production";

fs.mkdirSync(DATA_DIR, { recursive: true });

function loadJwtSecret(): string {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const file = path.join(DATA_DIR, "jwt-secret");
  try {
    const existing = fs.readFileSync(file, "utf8").trim();
    if (existing) return existing;
  } catch {
    // 不存在则生成
  }
  const secret = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

export const JWT_SECRET = loadJwtSecret();

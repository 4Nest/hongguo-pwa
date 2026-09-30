import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "./config.ts";

export const COOKIE_NAME = "hg_token";

export interface AuthedRequest extends Request {
  user?: { uid: number; role: string };
}

// Secure 只在请求确为 HTTPS 时设置：内网 HTTP 部署下浏览器会拒存 Secure cookie
function isHttps(req: Request): boolean {
  return req.secure || req.headers["x-forwarded-proto"] === "https";
}

export function signToken(req: Request, res: Response, uid: number, role: string) {
  const token = jwt.sign({ uid, role }, JWT_SECRET, { expiresIn: "30d" });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps(req),
    maxAge: 30 * 24 * 3600 * 1000,
  });
}

export function clearToken(req: Request, res: Response) {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: "lax", secure: isHttps(req) });
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: "未登录" });
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { uid: number; role: string };
    req.user = { uid: payload.uid, role: payload.role };
    next();
  } catch {
    return res.status(401).json({ error: "登录已过期" });
  }
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (req.user?.role !== "admin") return res.status(403).json({ error: "需要管理员权限" });
    next();
  });
}

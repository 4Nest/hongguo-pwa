export interface MediaItem {
  id: string;
  title: string;
  mediaType: string;
  posterUrl: string;
  description: string;
  remark?: string;
  /** 所属数据源（收藏/历史回填用） */
  source?: string;
}

export interface Episode {
  id: string;
  title: string;
  episodeNumber: number;
  streamUrl: string;
}

export interface Season {
  id: string;
  title: string;
  seasonNumber: number;
  episodes: Episode[];
}

export interface Detail {
  id: string;
  title: string;
  mediaType: string;
  posterUrl: string;
  description: string;
  seasonCount: number;
  episodeCount: number;
  seasons: Season[];
}

export interface User {
  id: number;
  username: string;
  role: string;
  source?: string;
  huangguoEnabled?: boolean;
}

export interface FavoriteItem {
  itemId: string;
  title: string;
  posterUrl: string | null;
  remark: string | null;
  mediaType: string | null;
  source?: string;
  createdAt: number;
}

export interface HistoryItem {
  itemId: string;
  title: string;
  posterUrl: string | null;
  episodeId: string | null;
  episodeNumber: number | null;
  positionSec: number | null;
  source?: string;
  updatedAt: number;
}

/** 海报统一走本站代理：手机只连局域网本站，避开第三方图床慢/中断 */
export function posterSrc(url: string | null | undefined): string {
  if (!url) return "";
  return `/api/hongguo/poster?u=${encodeURIComponent(url)}`;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, opts?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: opts?.method ?? "GET",
    credentials: "same-origin",
    headers: opts?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    let message = `请求失败 (${res.status})`;
    try {
      const data: unknown = await res.json();
      if (data && typeof data === "object" && "error" in data && typeof data.error === "string") {
        message = data.error;
      }
    } catch {
      // 保留默认消息
    }
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

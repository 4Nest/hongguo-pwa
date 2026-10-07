import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";

export interface SourceConfig {
  id: string;
  label: string;
  apiBase: string;
  /** 首页 tabs / 顶部分类导航 */
  categories: { id: string; label: string }[];
  /** 榜单 */
  ranks: { id: string; label: string }[];
  /** 首页推荐 fallback 榜/分类 */
  hotRank: string;
  /** 当前用户是否有权使用（false 时设置页灰显） */
  allowed?: boolean;
  /** 成人内容源 */
  nsfw?: boolean;
}

// 源列表由服务端下发（/api/me/sources）；这是加载完成前的惰性占位（不指向真实接口）
const HONGGUO_FALLBACK: SourceConfig = {
  id: "hongguo",
  label: "加载中…",
  apiBase: "/api/none",
  categories: [],
  ranks: [],
  hotRank: "",
  allowed: true,
};

let cache: SourceConfig[] | null = null;
const listeners = new Set<() => void>();

/** 管理端增删改来源后调用：清缓存并通知所有 useSources 重新拉取 */
export function refreshSources() {
  cache = null;
  listeners.forEach((l) => l());
}

/** 当前用户可见的数据源列表（内置红果 + 已启用扩展源） */
export function useSources(): SourceConfig[] {
  const { user } = useAuth();
  const [sources, setSources] = useState<SourceConfig[]>(cache ?? [HONGGUO_FALLBACK]);

  useEffect(() => {
    let alive = true;
    const load = () => {
      api<{ sources: SourceConfig[] }>("/api/me/sources")
        .then((d) => {
          if (!Array.isArray(d.sources)) return;
          cache = d.sources;
          if (alive) setSources(d.sources);
        })
        .catch(() => {});
    };
    if (cache) setSources(cache);
    else load();
    listeners.add(load);
    return () => {
      alive = false;
      listeners.delete(load);
    };
  }, [user?.id]);

  return sources;
}

/** 当前用户选择的数据源配置 */
export function useSource(): SourceConfig {
  const { user } = useAuth();
  const sources = useSources();
  return sources.find((s) => s.id === user?.source) ?? sources[0] ?? HONGGUO_FALLBACK;
}

// ---- 「猜你喜欢」缓存：30 分钟 TTL，按源分 key；有新观看记录时清除 ----

const REC_TTL = 30 * 60 * 1000;
const recKey = (sourceId: string) => `hg-rec-${sourceId}`;

export function readRecommendCache<T>(sourceId: string): { items: T[]; stale: boolean } | null {
  try {
    const raw = localStorage.getItem(recKey(sourceId));
    if (!raw) return null;
    const { at, items } = JSON.parse(raw) as { at: number; items: T[] };
    if (!Array.isArray(items) || items.length === 0) return null;
    // 过期也返回（先显示），由调用方后台刷新
    return { items, stale: Date.now() - at >= REC_TTL };
  } catch {
    return null;
  }
}

export function writeRecommendCache(sourceId: string, items: unknown[]) {
  try {
    localStorage.setItem(recKey(sourceId), JSON.stringify({ at: Date.now(), items }));
  } catch {
    // 存储满则忽略
  }
}

export function invalidateRecommendCache() {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("hg-rec-")) localStorage.removeItem(key);
  }
}

import { useAuth } from "@/lib/auth";

export type SourceId = "hongguo" | "huangguo";

export interface SourceConfig {
  id: SourceId;
  label: string;
  apiBase: string;
  /** 首页 tabs / 顶部分类导航 */
  categories: { id: string; label: string }[];
  /** 榜单 */
  ranks: { id: string; label: string }[];
  /** 首页推荐 fallback 榜 */
  hotRank: string;
}

export const SOURCES: Record<SourceId, SourceConfig> = {
  hongguo: {
    id: "hongguo",
    label: "红果短剧",
    apiBase: "/api/hongguo",
    categories: [
      { id: "short", label: "短剧" },
      { id: "comic", label: "漫剧" },
    ],
    ranks: [
      { id: "short-hot", label: "短剧热播" },
      { id: "short-new", label: "短剧新剧" },
      { id: "short-hot-search", label: "热搜榜" },
      { id: "short-yearly", label: "年度榜" },
      { id: "comic-hot", label: "漫剧热播" },
      { id: "comic-new", label: "漫剧新剧" },
    ],
    hotRank: "short-hot",
  },
  huangguo: {
    id: "huangguo",
    label: "黄果短剧",
    apiBase: "/api/huangguo",
    categories: [
      { id: "recommend", label: "推荐" },
      { id: "newest", label: "最新" },
      { id: "duanju", label: "AI短剧" },
      { id: "manju", label: "AI漫剧" },
      { id: "huanlian", label: "AI换脸" },
      { id: "mogai", label: "AI魔改" },
    ],
    ranks: [
      { id: "hot", label: "热播榜" },
      { id: "recommend", label: "推荐榜" },
      { id: "potential", label: "潜力榜" },
    ],
    hotRank: "hot",
  },
};

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
  localStorage.removeItem(recKey("hongguo"));
  localStorage.removeItem(recKey("huangguo"));
}

export function isSourceId(v: unknown): v is SourceId {
  return v === "hongguo" || v === "huangguo";
}

/** 当前用户选择的数据源配置 */
export function useSource(): SourceConfig {
  const { user } = useAuth();
  return SOURCES[isSourceId(user?.source) ? user.source : "hongguo"];
}

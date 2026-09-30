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

export function isSourceId(v: unknown): v is SourceId {
  return v === "hongguo" || v === "huangguo";
}

/** 当前用户选择的数据源配置 */
export function useSource(): SourceConfig {
  const { user } = useAuth();
  return SOURCES[isSourceId(user?.source) ? user.source : "hongguo"];
}

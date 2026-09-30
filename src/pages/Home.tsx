import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { History as HistoryIcon, Play, Sparkles } from "lucide-react";
import { api, posterSrc, type FavoriteItem, type HistoryItem, type MediaItem } from "@/lib/api";
import { HScroll, MediaCard, MediaGrid } from "@/components/MediaGrid";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePagedItems } from "@/hooks/usePagedItems";

/* ---------------- 最近观看 ---------------- */

function RecentSection() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    api<{ history: HistoryItem[] }>("/api/me/history")
      .then((d) => setItems(d.history.slice(0, 10)))
      .catch(() => {});
  }, []);

  if (items.length === 0) return null;
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-1.5 text-lg font-semibold">
        <HistoryIcon className="h-4 w-4 text-red-500" /> 最近观看
      </h2>
      <HScroll>
        {items.map((h) => (
          <div
            key={h.itemId}
            className="w-28 shrink-0 cursor-pointer sm:w-32"
            onClick={() => navigate(`/play/${h.itemId}/${h.episodeNumber ?? 1}`)}
          >
            <div className="relative aspect-[2/3] overflow-hidden rounded-md bg-muted">
              <img
                src={posterSrc(h.posterUrl)}
                alt={h.title}
                loading="lazy"
                className="h-full w-full object-cover"
              />
              {h.episodeNumber && (
                <Badge className="absolute right-1 top-1 bg-black/70 text-[10px] text-white hover:bg-black/70">
                  第{h.episodeNumber}集
                </Badge>
              )}
              <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors hover:bg-black/30">
                <Play className="h-8 w-8 fill-white text-white opacity-0 transition-opacity hover:opacity-100" />
              </div>
            </div>
            <p className="mt-1.5 line-clamp-1 text-sm">{h.title}</p>
          </div>
        ))}
      </HScroll>
    </section>
  );
}

/* ---------------- 猜你喜欢（简单推荐） ---------------- */

/**
 * 推荐算法：
 * 1. 取最近观看/收藏里最近的一部剧，用其标题前两个字调搜索接口找同类剧
 * 2. 合并「同分类 browse 热门」，排除已看过/已收藏
 * 3. 无任何互动时回退到热播榜
 */
async function fetchRecommendations(): Promise<MediaItem[]> {
  const [favRes, hisRes] = await Promise.all([
    api<{ favorites: FavoriteItem[] }>("/api/me/favorites").catch(() => ({ favorites: [] })),
    api<{ history: HistoryItem[] }>("/api/me/history").catch(() => ({ history: [] })),
  ]);
  const seen = new Set<string>([
    ...favRes.favorites.map((f) => f.itemId),
    ...hisRes.history.map((h) => h.itemId),
  ]);

  // 最近互动的剧（历史按 updated_at 倒序，收藏按 created_at 倒序，取两者最新）
  const latestHis = hisRes.history[0];
  const latestFav = favRes.favorites[0];
  const seed =
    latestHis && (!latestFav || latestHis.updatedAt >= latestFav.createdAt)
      ? latestHis
      : latestFav;

  const collected: MediaItem[] = [];
  const push = (list: MediaItem[]) => {
    for (const m of list) {
      if (!seen.has(m.id) && !collected.some((c) => c.id === m.id)) collected.push(m);
    }
  };

  if (seed?.title) {
    // 标题关键词搜索（取前 2 个字，太短则用全名）
    const kw = seed.title.replace(/[，。：！？、\s《》「」·-].*$/, "").slice(0, 2) || seed.title;
    const searched = await api<{ items: MediaItem[] }>(
      `/api/hongguo/search?q=${encodeURIComponent(kw)}&page=1`,
    ).catch(() => ({ items: [] }));
    push(searched.items ?? []);
    // 同分类热门补充
    const category = latestFav?.mediaType === "comic" ? "comic" : "short";
    const browse = await api<{ items: MediaItem[] }>(
      `/api/hongguo/browse?category=${category}&page=1`,
    ).catch(() => ({ items: [] }));
    push(browse.items ?? []);
  } else {
    const hot = await api<{ items: MediaItem[] }>(
      "/api/hongguo/browse?category=rank&rank=short-hot&page=1",
    ).catch(() => ({ items: [] }));
    push(hot.items ?? []);
  }
  return collected.slice(0, 12);
}

function RecommendSection() {
  const [items, setItems] = useState<MediaItem[] | null>(null);

  useEffect(() => {
    fetchRecommendations().then(setItems).catch(() => setItems([]));
  }, []);

  if (items === null) return <MediaGrid items={[]} loading className="mt-2" />;
  if (items.length === 0) return null;
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-1.5 text-lg font-semibold">
        <Sparkles className="h-4 w-4 text-red-500" /> 猜你喜欢
      </h2>
      <HScroll>
        {items.map((item) => (
          <div key={item.id} className="w-28 shrink-0 sm:w-32">
            <MediaCard item={item} />
          </div>
        ))}
      </HScroll>
    </section>
  );
}

/* ---------------- 分类 feed ---------------- */

function CategoryFeed({ category }: { category: "short" | "comic" }) {
  const { items, hasMore, loading, initialLoaded, loadMore, sentinelRef } = usePagedItems(
    (page) => `/api/hongguo/browse?category=${category}&page=${page}`,
    category,
  );
  return (
    <div>
      <MediaGrid items={items} loading={!initialLoaded || loading} />
      <div ref={sentinelRef} className="h-1" />
      {initialLoaded && !loading && items.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">暂无内容</p>
      )}
      {initialLoaded && hasMore && !loading && (
        <div className="mt-4 text-center">
          <Button variant="outline" onClick={() => void loadMore()}>
            加载更多
          </Button>
        </div>
      )}
    </div>
  );
}

/* ---------------- 首页 ---------------- */

export default function Home() {
  return (
    <div className="flex flex-col gap-6">
      <RecentSection />
      <RecommendSection />
      <Tabs defaultValue="short">
        <TabsList>
          <TabsTrigger value="short">短剧</TabsTrigger>
          <TabsTrigger value="comic">漫剧</TabsTrigger>
        </TabsList>
        <TabsContent value="short">
          <CategoryFeed category="short" />
        </TabsContent>
        <TabsContent value="comic">
          <CategoryFeed category="comic" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

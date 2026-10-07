import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { History as HistoryIcon, Play, Sparkles } from "lucide-react";
import { api, posterSrc, type FavoriteItem, type HistoryItem, type MediaItem } from "@/lib/api";
import { HScroll, MediaCard, MediaGrid } from "@/components/MediaGrid";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePagedItems } from "@/hooks/usePagedItems";
import { useSource, readRecommendCache, writeRecommendCache, type SourceConfig } from "@/lib/sources";
/* ---------------- 最近观看 ---------------- */

function RecentSection() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const navigate = useNavigate();
  const source = useSource();

  useEffect(() => {
    api<{ history: HistoryItem[] }>("/api/me/history")
      .then((d) =>
        setItems(d.history.filter((h) => (h.source ?? "hongguo") === source.id).slice(0, 10)),
      )
      .catch(() => {});
  }, [source.id]);

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
            onClick={() =>
              navigate(
                `/play/${h.source ?? "hongguo"}/${encodeURIComponent(h.itemId)}/${h.episodeNumber ?? 1}`,
              )
            }
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
async function fetchRecommendations(source: SourceConfig): Promise<MediaItem[]> {
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
    const kw = seed.title.replace(/[，。：！？、\s《》「」·-].*$/, "").slice(0, 2) || seed.title;
    // 同分类热门补充：收藏的是漫剧则优先漫剧分类，否则用源的首个分类
    const category =
      latestFav?.mediaType === "comic"
        ? (source.categories.find((c) => /comic|漫/.test(c.id + c.label))?.id ?? source.hotRank)
        : source.hotRank;
    // 搜索与热门并行：上游搜索可能很慢，不串行拖累
    const [searched, browse] = await Promise.all([
      api<{ items: MediaItem[] }>(
        `${source.apiBase}/search?q=${encodeURIComponent(kw)}&page=1`,
      ).catch(() => ({ items: [] })),
      api<{ items: MediaItem[] }>(
        `${source.apiBase}/browse?category=${category}&page=1`,
      ).catch(() => ({ items: [] })),
    ]);
    push(searched.items ?? []);
    push(browse.items ?? []);
  } else {
    // 无互动时回退到热播榜（hotRank 是榜单 id 则走 rank，否则是分类 id）
    const isRank = source.ranks.some((r) => r.id === source.hotRank);
    const hot = await api<{ items: MediaItem[] }>(
      isRank
        ? `${source.apiBase}/browse?category=rank&rank=${source.hotRank}&page=1`
        : `${source.apiBase}/browse?category=${source.hotRank}&page=1`,
    ).catch(() => ({ items: [] }));
    push(hot.items ?? []);
  }
  return collected.slice(0, 12).map((m) => ({ ...m, source: source.id }));
}

function RecommendSection() {
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const source = useSource();

  useEffect(() => {
    // 有缓存（哪怕过期）立即显示，过期或无缓存则后台刷新替换
    const cached = readRecommendCache<MediaItem>(source.id);
    if (cached) setItems(cached.items);
    if (cached && !cached.stale) return;
    if (!cached) setItems(null);
    fetchRecommendations(source)
      .then((list) => {
        if (list.length > 0) {
          setItems(list);
          writeRecommendCache(source.id, list);
        }
      })
      .catch(() => {
        if (!cached) setItems([]);
      });
  }, [source.id]);

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

function CategoryFeed({ source, category }: { source: SourceConfig; category: string }) {
  const { items, hasMore, loading, initialLoaded, loadMore, sentinelRef } = usePagedItems(
    (page) => `${source.apiBase}/browse?category=${category}&page=${page}`,
    `${source.id}-${category}`,
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
  const source = useSource();
  return (
    <div className="flex flex-col gap-6">
      <RecentSection />
      <RecommendSection />
      <Tabs key={source.id} defaultValue={source.categories[0]?.id}>
        <TabsList>
          {source.categories.map((c) => (
            <TabsTrigger key={c.id} value={c.id}>
              {c.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {source.categories.map((c) => (
          <TabsContent key={c.id} value={c.id}>
            <CategoryFeed source={source} category={c.id} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

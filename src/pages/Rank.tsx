import { useParams } from "react-router-dom";
import { MediaGrid } from "@/components/MediaGrid";
import { usePagedItems } from "@/hooks/usePagedItems";
import { Button } from "@/components/ui/button";
import { RANKS } from "@/components/Layout";

export default function Rank() {
  const { rankId = "short-hot" } = useParams();
  const rank = RANKS.find((r) => r.id === rankId);
  const safeRank = rank ? rank.id : "short-hot";
  const { items, hasMore, loading, initialLoaded, loadMore, sentinelRef } = usePagedItems(
    (page) => `/api/hongguo/browse?category=rank&rank=${safeRank}&page=${page}`,
    safeRank,
  );

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">{rank?.label ?? "榜单"}</h1>
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

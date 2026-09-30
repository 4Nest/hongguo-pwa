import { useParams } from "react-router-dom";
import { MediaGrid } from "@/components/MediaGrid";
import { usePagedItems } from "@/hooks/usePagedItems";
import { Button } from "@/components/ui/button";
import { useSource } from "@/lib/sources";

export default function Rank() {
  const { rankId = "" } = useParams();
  const source = useSource();
  const rank = source.ranks.find((r) => r.id === rankId) ?? source.ranks[0];
  const { items, hasMore, loading, initialLoaded, loadMore, sentinelRef } = usePagedItems(
    (page) => `${source.apiBase}/browse?category=rank&rank=${rank.id}&page=${page}`,
    `${source.id}-rank-${rank.id}`,
  );

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">{rank.label}</h1>
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

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { api, type MediaItem } from "@/lib/api";
import { HScroll, MediaCard } from "@/components/MediaGrid";
import { Skeleton } from "@/components/ui/skeleton";
import { useSource, type SourceConfig } from "@/lib/sources";

function RankPreview({
  source,
  rankId,
  label,
}: {
  source: SourceConfig;
  rankId: string;
  label: string;
}) {
  const [items, setItems] = useState<MediaItem[] | null>(null);

  useEffect(() => {
    setItems(null);
    api<{ items: MediaItem[] }>(
      `${source.apiBase}/browse?category=rank&rank=${rankId}&page=1`,
    )
      .then((d) =>
        setItems((d.items ?? []).slice(0, 10).map((m) => ({ ...m, source: source.id }))),
      )
      .catch(() => setItems([]));
  }, [source, rankId]);

  return (
    <section>
      <Link to={`/rank/${rankId}`} className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{label}</h2>
        <span className="flex items-center text-sm text-muted-foreground">
          更多 <ChevronRight className="h-4 w-4" />
        </span>
      </Link>
      {items === null ? (
        <HScroll>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="w-28 shrink-0 sm:w-32">
              <Skeleton className="aspect-[2/3] w-full rounded-md" />
              <Skeleton className="mt-1.5 h-4 w-3/4" />
            </div>
          ))}
        </HScroll>
      ) : (
        <HScroll>
          {items.map((item) => (
            <div key={item.id} className="w-28 shrink-0 sm:w-32">
              <MediaCard item={item} />
            </div>
          ))}
        </HScroll>
      )}
    </section>
  );
}

export default function Ranks() {
  const source = useSource();
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">榜单</h1>
      {source.ranks.map((r) => (
        <RankPreview key={r.id} source={source} rankId={r.id} label={r.label} />
      ))}
    </div>
  );
}

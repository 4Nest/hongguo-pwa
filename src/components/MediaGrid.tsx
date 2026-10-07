import { Link } from "react-router-dom";
import { posterSrc, type MediaItem } from "@/lib/api";
import { useSource } from "@/lib/sources";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function MediaCard({ item }: { item: MediaItem }) {
  const current = useSource();
  const source = item.source ?? current.id;
  return (
    <Link to={`/detail/${source}/${encodeURIComponent(item.id)}`} className="group block">
      <div className="relative aspect-[2/3] overflow-hidden rounded-md bg-muted">
        <img
          src={posterSrc(item.posterUrl)}
          alt={item.title}
          loading="lazy"
          className="h-full w-full object-cover transition-transform group-hover:scale-105"
        />
        {item.remark && (
          <Badge className="absolute right-1 top-1 bg-black/70 text-[10px] text-white hover:bg-black/70">
            {item.remark}
          </Badge>
        )}
      </div>
      <p className="mt-1.5 line-clamp-1 text-sm">{item.title}</p>
    </Link>
  );
}

/** 横滑卡片条（隐藏滚动条，边缘留白对齐页面） */
export function HScroll({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="-mx-4 overflow-x-auto px-4 pb-1 [&::-webkit-scrollbar]:hidden"
      style={{ scrollbarWidth: "none" }}
    >
      <div className="flex gap-3">{children}</div>
    </div>
  );
}

export function MediaGrid({
  items,
  loading,
  className,
}: {
  items: MediaItem[];
  loading?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6", className)}>
      {items.map((item) => (
        <MediaCard key={item.id} item={item} />
      ))}
      {loading &&
        Array.from({ length: 6 }).map((_, i) => (
          <div key={`sk-${i}`}>
            <Skeleton className="aspect-[2/3] w-full rounded-md" />
            <Skeleton className="mt-1.5 h-4 w-3/4" />
          </div>
        ))}
    </div>
  );
}

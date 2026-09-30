import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Heart, Play } from "lucide-react";
import { toast } from "sonner";
import {
  api,
  ApiError,
  posterSrc,
  type Detail as DetailType,
  type FavoriteItem,
  type HistoryItem,
} from "@/lib/api";
import { isSourceId, SOURCES } from "@/lib/sources";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export default function Detail() {
  const { source: sourceParam = "hongguo", id: rawId = "" } = useParams();
  const source = SOURCES[isSourceId(sourceParam) ? sourceParam : "hongguo"];
  const id = rawId;
  const navigate = useNavigate();
  const [detail, setDetail] = useState<DetailType | null>(null);
  const [favorited, setFavorited] = useState(false);
  const [history, setHistory] = useState<HistoryItem | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setDetail(null);
    setError("");
    api<DetailType>(`${source.apiBase}/items/${encodeURIComponent(id)}`)
      .then(setDetail)
      .catch((err) => setError(err instanceof ApiError ? err.message : "加载失败"));
    api<{ favorites: FavoriteItem[] }>("/api/me/favorites")
      .then((d) =>
        setFavorited(d.favorites.some((f) => f.itemId === id && (f.source ?? "hongguo") === source.id)),
      )
      .catch(() => {});
    api<{ history: HistoryItem[] }>("/api/me/history")
      .then((d) =>
        setHistory(
          d.history.find((h) => h.itemId === id && (h.source ?? "hongguo") === source.id) ?? null,
        ),
      )
      .catch(() => {});
  }, [id, source]);

  const episodes = useMemo(
    () => (detail?.seasons ?? []).flatMap((s) => s.episodes ?? []),
    [detail],
  );

  const playPath = (ep: number) =>
    `/play/${source.id}/${encodeURIComponent(id)}/${ep}`;

  const toggleFavorite = async () => {
    if (!detail) return;
    try {
      if (favorited) {
        await api(`/api/me/favorites/${encodeURIComponent(id)}`, { method: "DELETE" });
        setFavorited(false);
        toast.success("已取消收藏");
      } else {
        await api("/api/me/favorites", {
          method: "POST",
          body: {
            itemId: id,
            title: detail.title,
            posterUrl: detail.posterUrl,
            remark: `全${detail.episodeCount}集`,
            mediaType: detail.mediaType,
            source: source.id,
          },
        });
        setFavorited(true);
        toast.success("已收藏");
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "操作失败");
    }
  };

  if (error) return <p className="py-12 text-center text-muted-foreground">{error}</p>;
  if (!detail) {
    return (
      <div className="flex flex-col gap-4 sm:flex-row">
        <Skeleton className="aspect-[2/3] w-full max-w-48 rounded-md" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-7 w-1/2" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    );
  }

  const continueEp = history?.episodeNumber ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row">
        <img
          src={posterSrc(detail.posterUrl)}
          alt={detail.title}
          className="aspect-[2/3] w-full max-w-48 rounded-md object-cover"
        />
        <div className="flex flex-1 flex-col gap-3">
          <h1 className="text-xl font-semibold">{detail.title}</h1>
          <div className="flex gap-2">
            <Badge variant="secondary">{source.label}</Badge>
            <Badge variant="secondary">全{detail.episodeCount}集</Badge>
          </div>
          {detail.description && (
            <p className="line-clamp-4 text-sm text-muted-foreground">{detail.description}</p>
          )}
          <div className="mt-auto flex gap-2 pt-2">
            <Button onClick={() => navigate(playPath(continueEp ?? episodes[0]?.episodeNumber ?? 1))}>
              <Play className="mr-1 h-4 w-4" />
              {continueEp ? `继续播放 第${continueEp}集` : "开始播放"}
            </Button>
            <Button variant={favorited ? "default" : "outline"} onClick={() => void toggleFavorite()}>
              <Heart className={cn("mr-1 h-4 w-4", favorited && "fill-current text-red-500")} />
              {favorited ? "已收藏" : "收藏"}
            </Button>
          </div>
        </div>
      </div>

      <section>
        <h2 className="mb-2 text-lg font-semibold">选集（{episodes.length}）</h2>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
          {episodes.map((ep) => (
            <Button
              key={ep.id}
              variant={ep.episodeNumber === continueEp ? "default" : "outline"}
              size="sm"
              onClick={() => navigate(playPath(ep.episodeNumber))}
            >
              {ep.episodeNumber}
            </Button>
          ))}
        </div>
      </section>
    </div>
  );
}

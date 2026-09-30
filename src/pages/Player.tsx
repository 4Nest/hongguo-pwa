import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, type Detail as DetailType, type HistoryItem } from "@/lib/api";
import { isSourceId, SOURCES } from "@/lib/sources";
import VideoPlayer from "@/components/VideoPlayer";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export default function Player() {
  const { source: sourceParam = "hongguo", id = "", episodeNumber = "1" } = useParams();
  const source = SOURCES[isSourceId(sourceParam) ? sourceParam : "hongguo"];
  const epNum = Number(episodeNumber) || 1;
  const navigate = useNavigate();
  const [detail, setDetail] = useState<DetailType | null>(null);
  const [history, setHistory] = useState<HistoryItem | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setDetail(null);
    setError("");
    Promise.all([
      api<DetailType>(`${source.apiBase}/items/${encodeURIComponent(id)}`),
      api<{ history: HistoryItem[] }>("/api/me/history"),
    ])
      .then(([d, h]) => {
        setDetail(d);
        setHistory(h.history.find((x) => x.itemId === id && (x.source ?? "hongguo") === source.id) ?? null);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "加载失败");
        toast.error("加载失败");
      });
  }, [id, source]);

  const episodes = useMemo(
    () => (detail?.seasons ?? []).flatMap((s) => s.episodes ?? []),
    [detail],
  );
  const episode = episodes.find((e) => e.episodeNumber === epNum);

  // 仅当历史记录与当前集一致时才恢复进度
  const resumeAt =
    history && history.episodeNumber === epNum && (history.positionSec ?? 0) > 0
      ? history.positionSec
      : null;

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
        <p className="text-muted-foreground">{error}</p>
        <Button onClick={() => navigate(-1)}>返回</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pt-[env(safe-area-inset-top)]">
      <div className="mx-auto max-w-7xl p-3 sm:p-4">
        <Button variant="ghost" size="sm" className="mb-2" onClick={() => navigate(`/detail/${source.id}/${encodeURIComponent(id)}`)}>
          <ArrowLeft className="mr-1 h-4 w-4" /> 返回详情
        </Button>
        {!detail || !episode ? (
          <div className="space-y-3">
            <Skeleton className="aspect-[3/4] w-full rounded-lg sm:aspect-video" />
            {detail && !episode && (
              <p className="text-center text-muted-foreground">第{epNum}集不存在</p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4 lg:flex-row">
            <div className="min-w-0 flex-1">
              <VideoPlayer detail={detail} episode={episode} episodes={episodes} resumeAt={resumeAt} source={source.id} />
            </div>
            <aside className="w-full shrink-0 lg:w-64">
              <h2 className="mb-2 text-sm font-medium text-muted-foreground">
                选集（{episodes.length}）
              </h2>
              {/* 高度随内容，超出才滚动；避免固定高度留白 */}
              <div className="grid max-h-[45vh] grid-cols-5 gap-2 overflow-y-auto sm:grid-cols-8 lg:max-h-none lg:grid-cols-4 lg:overflow-visible">
                {episodes.map((ep) => (
                  <Button
                    key={ep.id}
                    variant={ep.episodeNumber === epNum ? "default" : "outline"}
                    size="sm"
                    className={cn(ep.episodeNumber === epNum && "bg-red-600 hover:bg-red-700")}
                    onClick={() => navigate(`/play/${source.id}/${encodeURIComponent(id)}/${ep.episodeNumber}`, { replace: true })}
                  >
                    {ep.episodeNumber}
                  </Button>
                ))}
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

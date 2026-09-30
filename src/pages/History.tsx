import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Play, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, posterSrc, type HistoryItem } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function History() {
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const navigate = useNavigate();

  const load = () =>
    api<{ history: HistoryItem[] }>("/api/me/history")
      .then((d) => setItems(d.history))
      .catch(() => setItems([]));

  useEffect(() => {
    void load();
  }, []);

  const remove = async (itemId: string) => {
    await api(`/api/me/history/${itemId}`, { method: "DELETE" });
    setItems((prev) => (prev ?? []).filter((h) => h.itemId !== itemId));
    toast.success("已删除");
  };

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">最近观看</h1>
      {items === null ? null : items.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">暂无观看记录</p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((h) => (
            <div
              key={h.itemId}
              className="flex cursor-pointer items-center gap-3 rounded-md border p-2 hover:bg-accent"
              onClick={() => navigate(`/play/${h.source ?? "hongguo"}/${encodeURIComponent(h.itemId)}/${h.episodeNumber ?? 1}`)}
            >
              <img
                src={posterSrc(h.posterUrl)}
                alt={h.title}
                className="h-16 w-12 rounded object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-1 text-sm font-medium">{h.title}</p>
                <div className="mt-1 flex items-center gap-2">
                  {h.episodeNumber && <Badge variant="secondary">第{h.episodeNumber}集</Badge>}
                  <span className="text-xs text-muted-foreground">
                    {new Date(h.updatedAt).toLocaleString()}
                  </span>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="shrink-0" asChild>
                <Link to={`/play/${h.source ?? "hongguo"}/${encodeURIComponent(h.itemId)}/${h.episodeNumber ?? 1}`}>
                  <Play className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  void remove(h.itemId);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

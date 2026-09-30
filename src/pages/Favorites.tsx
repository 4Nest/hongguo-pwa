import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type FavoriteItem } from "@/lib/api";
import { MediaGrid } from "@/components/MediaGrid";

export default function Favorites() {
  const [items, setItems] = useState<FavoriteItem[] | null>(null);

  useEffect(() => {
    api<{ favorites: FavoriteItem[] }>("/api/me/favorites")
      .then((d) => setItems(d.favorites))
      .catch(() => setItems([]));
  }, []);

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">我的收藏</h1>
      {items === null ? (
        <MediaGrid items={[]} loading />
      ) : items.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          还没有收藏，去{" "}
          <Link to="/" className="text-red-500 underline">
            首页
          </Link>{" "}
          逛逛吧
        </p>
      ) : (
        <MediaGrid
          items={items.map((f) => ({
            id: f.itemId,
            title: f.title,
            posterUrl: f.posterUrl ?? "",
            mediaType: f.mediaType ?? "tv",
            description: "",
            remark: f.remark ?? undefined,
          }))}
        />
      )}
    </div>
  );
}

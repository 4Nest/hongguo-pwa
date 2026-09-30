import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api, ApiError, type MediaItem } from "@/lib/api";

interface PagedResult {
  items: MediaItem[];
}

/** 分页加载：page 从 1 递增，返回空 items 即视为没有更多 */
export function usePagedItems(fetchUrl: (page: number) => string, resetKey: string) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const loadingRef = useRef(false);

  const loadMore = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const data = await api<PagedResult>(fetchUrl(page));
      const list = Array.isArray(data.items) ? data.items : [];
      if (list.length === 0) {
        setHasMore(false);
      } else {
        setItems((prev) => {
          const seen = new Set(prev.map((i) => i.id));
          return [...prev, ...list.filter((i) => !seen.has(i.id))];
        });
        setPage((p) => p + 1);
      }
      setInitialLoaded(true);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "加载失败");
      setHasMore(false);
      setInitialLoaded(true);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [fetchUrl, page]);

  // resetKey 变化时重置
  useEffect(() => {
    setItems([]);
    setPage(1);
    setHasMore(true);
    setInitialLoaded(false);
    loadingRef.current = false;
  }, [resetKey]);

  // 首屏加载
  useEffect(() => {
    if (!initialLoaded && !loadingRef.current && hasMore) void loadMore();
  }, [initialLoaded, hasMore, loadMore]);

  // IntersectionObserver 自动加载
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const ob = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && hasMore && !loadingRef.current) void loadMore();
    });
    ob.observe(el);
    return () => ob.disconnect();
  }, [hasMore, loadMore]);

  return { items, hasMore, loading, initialLoaded, loadMore, sentinelRef };
}

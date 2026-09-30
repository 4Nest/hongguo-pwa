import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { MediaGrid } from "@/components/MediaGrid";
import { usePagedItems } from "@/hooks/usePagedItems";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSource } from "@/lib/sources";

export default function Search() {
  const [params, setParams] = useSearchParams();
  const keyword = params.get("keyword") ?? "";
  const [input, setInput] = useState(keyword);
  const source = useSource();

  // 输入防抖 300ms 更新 URL（触发搜索）
  useEffect(() => {
    const t = setTimeout(() => {
      const q = input.trim();
      if (q !== keyword) setParams(q ? { keyword: q } : {});
    }, 300);
    return () => clearTimeout(t);
  }, [input]); // eslint-disable-line react-hooks/exhaustive-deps
  const { items, hasMore, loading, initialLoaded, loadMore, sentinelRef } = usePagedItems(
    (page) => `${source.apiBase}/search?q=${encodeURIComponent(keyword)}&page=${page}`,
    `${source.id}-${keyword}`,
  );

  return (
    <div>
      <Input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="搜索短剧 / 漫剧..."
        className="mb-4"
        autoFocus
      />
      {!keyword && (
        <p className="py-8 text-center text-sm text-muted-foreground">输入关键词开始搜索</p>
      )}
      {keyword && (
        <>
          <MediaGrid items={items} loading={!initialLoaded || loading} />
          <div ref={sentinelRef} className="h-1" />
          {initialLoaded && !loading && items.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              没有找到「{keyword}」相关内容
            </p>
          )}
          {initialLoaded && hasMore && !loading && (
            <div className="mt-4 text-center">
              <Button variant="outline" onClick={() => void loadMore()}>
                加载更多
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

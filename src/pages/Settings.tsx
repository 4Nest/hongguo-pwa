import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Database } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useSources } from "@/lib/sources";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function Settings() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const sources = useSources();
  const current = sources.find((s) => s.id === user?.source) ?? sources[0];

  const switchSource = async (id: string) => {
    if (id === current?.id || pending) return;
    setPending(true);
    try {
      await api("/api/me/source", { method: "POST", body: { source: id } });
      await refresh();
      toast.success(`已切换到${sources.find((s) => s.id === id)?.label ?? id}`);
      navigate("/");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "切换失败");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4" /> 数据源
          </CardTitle>
          <CardDescription>切换内容源，浏览记录与收藏按源独立</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {sources.filter((s) => s.allowed !== false).map((s) => {
            const selected = current?.id === s.id;
            return (
              <button
                key={s.id}
                disabled={pending}
                onClick={() => void switchSource(s.id)}
                className={cn(
                  "flex items-center justify-between rounded-md border px-4 py-3 text-left transition-colors",
                  selected ? "border-red-500/70 bg-accent" : "hover:bg-accent",
                )}
              >
                <p className="font-medium">
                  {s.label}
                  {s.nsfw && (
                    <span className="ml-1.5 align-middle text-xs text-red-400">成人</span>
                  )}
                </p>
                {selected && (
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-red-500">
                    <Check className="h-3 w-3 text-white" strokeWidth={3} />
                  </span>
                )}
              </button>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

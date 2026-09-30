import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Database } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { SOURCES, isSourceId, type SourceId } from "@/lib/sources";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function Settings() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const current: SourceId = isSourceId(user?.source) ? user.source : "hongguo";

  const switchSource = async (id: SourceId) => {
    if (id === current || pending) return;
    setPending(true);
    try {
      await api("/api/me/source", { method: "POST", body: { source: id } });
      await refresh();
      toast.success(`已切换到${SOURCES[id].label}`);
      navigate("/");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "切换失败");
    } finally {
      setPending(false);
    }
  };

  const huangguoAvailable = user?.huangguoEnabled === true;

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-4 text-xl font-semibold">设置</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4" /> 数据源
          </CardTitle>
          <CardDescription>切换内容源，浏览记录与收藏按源独立</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {Object.values(SOURCES).map((s) => {
            const disabled = s.id === "huangguo" && !huangguoAvailable;
            return (
              <button
                key={s.id}
                disabled={disabled || pending}
                onClick={() => void switchSource(s.id)}
                className={cn(
                  "flex items-center justify-between rounded-md border px-4 py-3 text-left transition-colors",
                  current === s.id ? "border-red-500 bg-red-500/10" : "hover:bg-accent",
                  disabled && "cursor-not-allowed opacity-50",
                )}
              >
                <div>
                  <p className="font-medium">{s.label}</p>
                  {disabled && (
                    <p className="text-xs text-muted-foreground">未开放（需管理员开启）</p>
                  )}
                </div>
                {current === s.id && <Check className="h-4 w-4 text-red-500" />}
              </button>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

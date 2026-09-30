import { Link, Outlet, useNavigate } from "react-router-dom";
import { useState } from "react";
import {
  Clapperboard,
  Heart,
  History,
  Home,
  KeyRound,
  LogOut,
  Search,
  Settings as SettingsIcon,
  Trophy,
  Shield,
  User as UserIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useSource } from "@/lib/sources";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    try {
      await api("/api/me/password", { method: "POST", body: { oldPassword, newPassword } });
      toast.success("密码已修改");
      onOpenChange(false);
      setOldPassword("");
      setNewPassword("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "修改失败");
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>修改密码</DialogTitle>
          <DialogDescription>输入原密码和新密码（至少 6 位）</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="old-password">原密码</Label>
            <Input
              id="old-password"
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-password">新密码</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              minLength={6}
              required
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "提交中..." : "确认修改"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const source = useSource();
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState("");
  const [pwdOpen, setPwdOpen] = useState(false);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = keyword.trim();
    if (q) navigate(`/search?keyword=${encodeURIComponent(q)}`);
  };

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <header className="sticky top-0 z-40 border-b bg-background/95 pt-[calc(env(safe-area-inset-top)+0.5rem)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Link to="/" className="flex items-center gap-1.5 font-bold text-red-500">
            <Clapperboard className="h-5 w-5" />
            <span>{source.label}</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
              首页
            </Button>
            {source.categories.slice(0, 2).map((c) => (
              <Button
                key={c.id}
                variant="ghost"
                size="sm"
                onClick={() => navigate(`/browse/${c.id}`)}
              >
                {c.label}
              </Button>
            ))}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  榜单
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {source.ranks.map((r) => (
                  <DropdownMenuItem key={r.id} onClick={() => navigate(`/rank/${r.id}`)}>
                    {r.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </nav>
          <form onSubmit={submitSearch} className="ml-auto flex w-36 items-center gap-1 sm:w-56">
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索短剧..."
              className="h-8"
            />
            <Button type="submit" variant="ghost" size="icon" className="h-8 w-8 shrink-0">
              <Search className="h-4 w-4" />
            </Button>
          </form>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <UserIcon className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <div className="px-2 py-1.5 text-sm text-muted-foreground">{user?.username}</div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/favorites")}>
                <Heart className="mr-2 h-4 w-4" /> 我的收藏
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/history")}>
                <History className="mr-2 h-4 w-4" /> 最近观看
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/settings")}>
                <SettingsIcon className="mr-2 h-4 w-4" /> 设置
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setPwdOpen(true)}>
                <KeyRound className="mr-2 h-4 w-4" /> 修改密码
              </DropdownMenuItem>
              {user?.role === "admin" && (
                <DropdownMenuItem onClick={() => navigate("/admin")}>
                  <Shield className="mr-2 h-4 w-4" /> 管理面板
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  void logout().then(() => navigate("/login"));
                }}
              >
                <LogOut className="mr-2 h-4 w-4" /> 退出登录
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      <ChangePasswordDialog open={pwdOpen} onOpenChange={setPwdOpen} />
      </header>

      <main className="mx-auto max-w-6xl px-4 py-4">
        <Outlet />
      </main>

      {/* 移动端底部 tab */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {[
          { to: "/", icon: Home, label: "首页" },
          { to: "/ranks", icon: Trophy, label: "榜单" },
          { to: "/favorites", icon: Heart, label: "收藏" },
          { to: "/history", icon: History, label: "我的" },
        ].map(({ to, icon: Icon, label }) => (
          <Link
            key={to}
            to={to}
            className="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs text-muted-foreground active:text-foreground"
          >
            <Icon className="h-5 w-5" />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

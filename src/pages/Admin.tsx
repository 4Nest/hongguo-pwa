import { useCallback, useEffect, useState } from "react";
import { Copy, KeyRound, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { refreshSources } from "@/lib/sources";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberStepper } from "@/components/NumberStepper";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Invite {
  code: string;
  created_at: number;
  used_at: number | null;
  used_by_username: string | null;
  expires_at: number | null;
}

interface AdminUser {
  id: number;
  username: string;
  role: string;
  created_at: number;
  favorite_count: number;
  history_count: number;
  huangguo_allowed: number;
  expires_at: number | null;
}

function InvitesTab() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [count, setCount] = useState("1");
  const [expiresDays, setExpiresDays] = useState("");

  const load = useCallback(
    () =>
      api<{ invites: Invite[] }>("/api/admin/invites")
        .then((d) => setInvites(d.invites))
        .catch(() => {}),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const generate = async () => {
    try {
      const d = await api<{ codes: string[] }>("/api/admin/invites", {
        method: "POST",
        body: {
          count: Number(count) || 1,
          expiresInDays: Number(expiresDays) > 0 ? Number(expiresDays) : undefined,
        },
      });
      toast.success(`已生成 ${d.codes.length} 个邀请码`);
      void load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "生成失败");
    }
  };

  const copy = (code: string) => {
    void navigator.clipboard.writeText(code).then(() => toast.success(`已复制 ${code}`));
  };

  const remove = async (code: string) => {
    try {
      await api(`/api/admin/invites/${code}`, { method: "DELETE" });
      toast.success("已删除");
      void load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "删除失败");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">数量</span>
        <NumberStepper value={count} onChange={setCount} min={1} max={50} />
        <span className="text-sm text-muted-foreground">有效期（天，留空永久）</span>
        <NumberStepper value={expiresDays} onChange={setExpiresDays} min={0} placeholder="永久" />
        <Button onClick={() => void generate()}>生成邀请码</Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>邀请码</TableHead>
            <TableHead>创建时间</TableHead>
            <TableHead>使用者</TableHead>
            <TableHead>有效期</TableHead>
            <TableHead>状态</TableHead>
            <TableHead className="w-20">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invites.map((inv) => (
            <TableRow key={inv.code}>
              <TableCell className="font-mono">{inv.code}</TableCell>
              <TableCell>{new Date(inv.created_at).toLocaleString()}</TableCell>
              <TableCell>{inv.used_by_username ?? "-"}</TableCell>
              <TableCell>
                {inv.expires_at === null ? (
                  <span className="text-muted-foreground">永久</span>
                ) : inv.expires_at < Date.now() ? (
                  <span className="text-red-500">已过期</span>
                ) : (
                  new Date(inv.expires_at).toLocaleDateString()
                )}
              </TableCell>
              <TableCell>
                {inv.used_at ? <Badge>已使用</Badge> : <Badge variant="secondary">未使用</Badge>}
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => copy(inv.code)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="删除"
                    onClick={() => void remove(inv.code)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function UsersTab() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [pendingDelete, setPendingDelete] = useState<AdminUser | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newUser, setNewUser] = useState({ username: "", password: "", expiresInDays: "" });
  const [expiresTarget, setExpiresTarget] = useState<AdminUser | null>(null);
  const [expiresDays, setExpiresDays] = useState("");
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [accessTarget, setAccessTarget] = useState<AdminUser | null>(null);

  const load = useCallback(
    () =>
      api<{ users: AdminUser[] }>("/api/admin/users")
        .then((d) => setUsers(d.users))
        .catch(() => {}),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async () => {
    if (!pendingDelete) return;
    try {
      await api(`/api/admin/users/${pendingDelete.id}`, { method: "DELETE" });
      toast.success(`已删除用户 ${pendingDelete.username}`);
      setPendingDelete(null);
      void load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "删除失败");
    }
  };

  const openAccess = (u: AdminUser) => {
    setAccessTarget(u);
  };

  const addUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api("/api/admin/users", {
        method: "POST",
        body: {
          username: newUser.username,
          password: newUser.password,
          expiresInDays: Number(newUser.expiresInDays) > 0 ? Number(newUser.expiresInDays) : undefined,
        },
      });
      toast.success(`已创建用户 ${newUser.username}`);
      setAddOpen(false);
      setNewUser({ username: "", password: "", expiresInDays: "" });
      void load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "创建失败");
    }
  };

  const saveExpires = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expiresTarget) return;
    try {
      await api(`/api/admin/users/${expiresTarget.id}/expires`, {
        method: "PUT",
        body: { days: Number(expiresDays) || 0 },
      });
      toast.success(`已更新 ${expiresTarget.username} 的有效期`);
      setExpiresTarget(null);
      void load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "操作失败");
    }
  };

  const doResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    try {
      await api(`/api/admin/users/${resetTarget.id}/password`, {
        method: "POST",
        body: { password: resetPassword },
      });
      toast.success(`已重置 ${resetTarget.username} 的密码`);
      setResetTarget(null);
      setResetPassword("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "重置失败");
    }
  };

  return (
    <>
      <div className="mb-3">
        <Button onClick={() => setAddOpen(true)}>添加用户</Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>用户名</TableHead>
            <TableHead>角色</TableHead>
            <TableHead>注册时间</TableHead>
            <TableHead>收藏数</TableHead>
            <TableHead>历史数</TableHead>
            <TableHead>源权限</TableHead>
            <TableHead>有效期</TableHead>
            <TableHead className="w-20">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => (
            <TableRow key={u.id}>
              <TableCell>{u.username}</TableCell>
              <TableCell>
                {u.role === "admin" ? <Badge>管理员</Badge> : <Badge variant="secondary">用户</Badge>}
              </TableCell>
              <TableCell>{new Date(u.created_at).toLocaleString()}</TableCell>
              <TableCell>{u.favorite_count}</TableCell>
              <TableCell>{u.history_count}</TableCell>
              <TableCell>
                <Button variant="outline" size="sm" onClick={() => openAccess(u)}>
                  管理
                </Button>
              </TableCell>
              <TableCell>
                <button
                  className="cursor-pointer text-left"
                  title="点击设置有效期"
                  onClick={() => {
                    setExpiresTarget(u);
                    setExpiresDays("");
                  }}
                >
                  {u.expires_at === null ? (
                    <span className="text-muted-foreground">永久</span>
                  ) : u.expires_at < Date.now() ? (
                    <span className="text-red-500">已过期</span>
                  ) : (
                    new Date(u.expires_at).toLocaleDateString()
                  )}
                </button>
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    title="重置密码"
                    onClick={() => {
                      setResetTarget(u);
                      setResetPassword("");
                    }}
                  >
                    <KeyRound className="h-4 w-4" />
                  </Button>
                  {u.role !== "admin" && u.id !== me?.id && (
                    <Button variant="ghost" size="icon" onClick={() => setPendingDelete(u)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Dialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除用户</DialogTitle>
            <DialogDescription>
              确定删除用户「{pendingDelete?.username}」？其收藏与观看记录将一并删除，不可恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              取消
            </Button>
            <Button variant="destructive" onClick={() => void remove()}>
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加用户</DialogTitle>
            <DialogDescription>直接创建账号，无需邀请码</DialogDescription>
          </DialogHeader>
          <form onSubmit={addUser} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="add-username">用户名</Label>
              <Input
                id="add-username"
                value={newUser.username}
                onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="add-password">初始密码（至少 6 位）</Label>
              <Input
                id="add-password"
                type="password"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                minLength={6}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>有效期（天，留空为永久）</Label>
              <NumberStepper
                value={newUser.expiresInDays}
                onChange={(v) => setNewUser({ ...newUser, expiresInDays: v })}
                min={0}
                placeholder="永久"
              />
            </div>
            <DialogFooter>
              <Button type="submit">创建</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={expiresTarget !== null}
        onOpenChange={(open) => !open && setExpiresTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>设置有效期</DialogTitle>
            <DialogDescription>
              用户「{expiresTarget?.username}」：输入天数（自现在起），0 或留空为永久
              {expiresTarget?.expires_at
                ? `；当前到期：${new Date(expiresTarget.expires_at).toLocaleString()}`
                : "；当前：永久"}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveExpires} className="flex flex-col gap-4">
            <NumberStepper
              value={expiresDays}
              onChange={setExpiresDays}
              min={0}
              placeholder="天数，空 = 永久"
            />
            <DialogFooter>
              <Button type="submit">保存</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={resetTarget !== null}
        onOpenChange={(open) => !open && setResetTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重置密码</DialogTitle>
            <DialogDescription>
              为用户「{resetTarget?.username}」设置新密码（至少 6 位）
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={doResetPassword} className="flex flex-col gap-4">
            <Input
              type="password"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              minLength={6}
              placeholder="新密码"
              required
            />
            <DialogFooter>
              <Button type="submit">确认重置</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <SourceAccessDialog user={accessTarget} onClose={() => setAccessTarget(null)} />
    </>
  );
}

/** 每用户 × 每源授权弹窗 */
interface UserSourceAccess {
  id: string;
  label: string;
  nsfw: boolean;
  enabled: boolean;
  allowed: boolean;
}

function SourceAccessDialog({ user, onClose }: { user: AdminUser | null; onClose: () => void }) {
  const [rows, setRows] = useState<UserSourceAccess[]>([]);

  const load = useCallback(() => {
    if (!user) return;
    api<{ sources: UserSourceAccess[] }>(`/api/admin/users/${user.id}/sources`)
      .then((d) => setRows(d.sources))
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    setRows([]);
    load();
  }, [load]);

  const toggle = async (s: UserSourceAccess) => {
    if (!user) return;
    try {
      await api(`/api/admin/users/${user.id}/sources/${s.id}`, {
        method: "PUT",
        body: { allowed: !s.allowed },
      });
      setRows((rs) => rs.map((r) => (r.id === s.id ? { ...r, allowed: !r.allowed } : r)));
      refreshSources();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "操作失败");
    }
  };

  return (
    <Dialog open={user !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>源权限 · {user?.username}</DialogTitle>
          <DialogDescription>
            控制该用户可使用哪些来源；未单独设置时，非成人源默认开放
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {rows.length === 0 && <p className="text-sm text-muted-foreground">暂无来源</p>}
          {rows.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-md border px-3 py-2">
              <div>
                <p className="font-medium">
                  {s.label}
                  {s.nsfw && <span className="ml-1 text-xs text-red-500">成人</span>}
                  {!s.enabled && <span className="ml-1 text-xs text-muted-foreground">（已停用）</span>}
                </p>
              </div>
              <Button
                variant={s.allowed ? "default" : "outline"}
                size="sm"
                onClick={() => void toggle(s)}
              >
                {s.allowed ? "允许" : "禁止"}
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface WidgetSourceRow {
  id: string;
  url: string;
  label: string;
  enabled: number;
  nsfw: number;
  created_at: number;
}

function SettingsTab() {
  const [sources, setSources] = useState<WidgetSourceRow[]>([]);
  const [newUrl, setNewUrl] = useState("");
  const [adding, setAdding] = useState(false);

  const loadSources = useCallback(
    () =>
      api<{ sources: WidgetSourceRow[] }>("/api/admin/sources")
        .then((d) => setSources(d.sources))
        .catch(() => {}),
    [],
  );

  useEffect(() => {
    void loadSources();
  }, [loadSources]);

  const addSource = async () => {
    const url = newUrl.trim();
    if (!url || adding) return;
    setAdding(true);
    try {
      await api("/api/admin/sources", { method: "POST", body: { url } });
      setNewUrl("");
      await loadSources();
      refreshSources();
      toast.success("来源已添加");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "添加失败");
    } finally {
      setAdding(false);
    }
  };

  const toggleSource = async (s: WidgetSourceRow) => {
    try {
      await api(`/api/admin/sources/${s.id}`, {
        method: "PUT",
        body: { enabled: !s.enabled },
      });
      await loadSources();
      refreshSources();
      toast.success(`${s.label} 已${s.enabled ? "关闭" : "开启"}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "操作失败");
    }
  };

  const toggleNsfw = async (s: WidgetSourceRow) => {
    try {
      await api(`/api/admin/sources/${s.id}`, {
        method: "PUT",
        body: { nsfw: !s.nsfw },
      });
      await loadSources();
      refreshSources();
      toast.success(`${s.label} 已标记为${s.nsfw ? "开放" : "成人"}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "操作失败");
    }
  };

  const removeSource = async (s: WidgetSourceRow) => {
    if (!window.confirm(`确定删除来源「${s.label}」？用户的收藏/历史记录会保留但无法再通过该源播放。`))
      return;
    try {
      await api(`/api/admin/sources/${s.id}`, { method: "DELETE" });
      await loadSources();
      refreshSources();
      toast.success(`${s.label} 已删除`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "删除失败");
    }
  };

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div className="rounded-md border p-4">
        <p className="font-medium">来源</p>
        <p className="mb-3 text-sm text-muted-foreground">
          粘贴 Capy 页面的组件链接（…/widgets/xxx.js）即可添加；「成人」源需在用户列表单独授权，开放源所有用户可用
        </p>
        <div className="mb-3 flex gap-2">
          <Input
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="http://192.168.2.110:8788/widgets/xxx.js"
            className="font-mono text-sm"
            onKeyDown={(e) => e.key === "Enter" && void addSource()}
          />
          <Button onClick={() => void addSource()} disabled={adding || !newUrl.trim()}>
            {adding ? "添加中…" : "添加"}
          </Button>
        </div>
        <div className="flex flex-col gap-2">
          {sources.length === 0 && (
            <p className="py-2 text-sm text-muted-foreground">暂无来源</p>
          )}
          {sources.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{s.label}</p>
                <p className="truncate font-mono text-xs text-muted-foreground">{s.url}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant={s.nsfw ? "destructive" : "outline"}
                  size="sm"
                  title="成人源需在用户列表单独授权"
                  onClick={() => void toggleNsfw(s)}
                >
                  {s.nsfw ? "成人" : "开放"}
                </Button>
                <Button
                  variant={s.enabled ? "default" : "outline"}
                  size="sm"
                  onClick={() => void toggleSource(s)}
                >
                  {s.enabled ? "已开启" : "已关闭"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => void removeSource(s)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Admin() {
  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">管理面板</h1>
      <Tabs defaultValue="invites">
        <TabsList>
          <TabsTrigger value="invites">邀请码</TabsTrigger>
          <TabsTrigger value="users">用户</TabsTrigger>
          <TabsTrigger value="settings">设置</TabsTrigger>
        </TabsList>
        <TabsContent value="invites" className="mt-4">
          <InvitesTab />
        </TabsContent>
        <TabsContent value="users" className="mt-4">
          <UsersTab />
        </TabsContent>
        <TabsContent value="settings" className="mt-4">
          <SettingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

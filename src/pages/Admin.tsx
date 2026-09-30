import { useCallback, useEffect, useState } from "react";
import { Copy, KeyRound, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
}

interface AdminUser {
  id: number;
  username: string;
  role: string;
  created_at: number;
  favorite_count: number;
  history_count: number;
  huangguo_allowed: number;
}

function InvitesTab() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [count, setCount] = useState(1);
  const [newCodes, setNewCodes] = useState<string[]>([]);

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
        body: { count },
      });
      setNewCodes(d.codes);
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
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={1}
          max={50}
          value={count}
          onChange={(e) => setCount(Number(e.target.value) || 1)}
          className="w-24"
        />
        <Button onClick={() => void generate()}>生成邀请码</Button>
      </div>
      {newCodes.length > 0 && (
        <div className="flex flex-wrap gap-2 rounded-md border border-green-800 bg-green-950/40 p-3">
          {newCodes.map((c) => (
            <Badge key={c} variant="secondary" className="cursor-pointer text-sm" onClick={() => copy(c)}>
              {c} <Copy className="ml-1 h-3 w-3" />
            </Badge>
          ))}
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>邀请码</TableHead>
            <TableHead>创建时间</TableHead>
            <TableHead>使用者</TableHead>
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
                {inv.used_at ? <Badge>已使用</Badge> : <Badge variant="secondary">未使用</Badge>}
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => copy(inv.code)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  {!inv.used_at && (
                    <Button variant="ghost" size="icon" onClick={() => void remove(inv.code)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
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
  const [newUser, setNewUser] = useState({ username: "", password: "" });
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null);
  const [resetPassword, setResetPassword] = useState("");

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

  const toggleHuangguo = async (u: AdminUser) => {
    try {
      await api(`/api/admin/users/${u.id}/huangguo`, {
        method: "PUT",
        body: { allowed: !u.huangguo_allowed },
      });
      toast.success(`${u.username} 黄果权限已${u.huangguo_allowed ? "关闭" : "开启"}`);
      void load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "操作失败");
    }
  };

  const addUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api("/api/admin/users", { method: "POST", body: newUser });
      toast.success(`已创建用户 ${newUser.username}`);
      setAddOpen(false);
      setNewUser({ username: "", password: "" });
      void load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "创建失败");
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
            <TableHead>黄果权限</TableHead>
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
                <Button
                  variant={u.huangguo_allowed ? "default" : "outline"}
                  size="sm"
                  onClick={() => void toggleHuangguo(u)}
                >
                  {u.huangguo_allowed ? "允许" : "禁止"}
                </Button>
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
            <DialogFooter>
              <Button type="submit">创建</Button>
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
    </>
  );
}

function SettingsTab() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [upstream, setUpstream] = useState("");
  const [savedUpstream, setSavedUpstream] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    api<{ huangguoEnabled: boolean; upstreamUrl: string }>("/api/admin/settings")
      .then((d) => {
        setEnabled(d.huangguoEnabled);
        setUpstream(d.upstreamUrl);
        setSavedUpstream(d.upstreamUrl);
      })
      .catch(() => {});
  }, []);

  const toggle = async () => {
    if (enabled === null || pending) return;
    setPending(true);
    try {
      const d = await api<{ huangguoEnabled: boolean }>("/api/admin/settings", {
        method: "PUT",
        body: { huangguoEnabled: !enabled },
      });
      setEnabled(d.huangguoEnabled);
      toast.success(d.huangguoEnabled ? "黄果源已开启" : "黄果源已关闭");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "操作失败");
    } finally {
      setPending(false);
    }
  };

  const saveUpstream = async () => {
    const url = upstream.trim();
    if (!url || url === savedUpstream || pending) return;
    setPending(true);
    try {
      const d = await api<{ upstreamUrl: string }>("/api/admin/settings", {
        method: "PUT",
        body: { upstreamUrl: url },
      });
      setUpstream(d.upstreamUrl);
      setSavedUpstream(d.upstreamUrl);
      toast.success("上游地址已保存，即时生效");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "保存失败");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <div className="rounded-md border p-4">
        <p className="font-medium">上游地址（Capy Backend）</p>
        <p className="mb-3 text-sm text-muted-foreground">
          红果与黄果的数据都来自该地址，修改后即时生效
        </p>
        <div className="flex gap-2">
          <Input
            value={upstream}
            onChange={(e) => setUpstream(e.target.value)}
            placeholder="http://192.168.2.110:8788"
            className="font-mono text-sm"
          />
          <Button
            onClick={() => void saveUpstream()}
            disabled={pending || !upstream.trim() || upstream.trim() === savedUpstream}
          >
            保存
          </Button>
        </div>
      </div>
      <div className="flex items-center justify-between rounded-md border p-4">
        <div>
          <p className="font-medium">黄果源</p>
          <p className="text-sm text-muted-foreground">
            开启后，用户可在「设置」页切换到黄果短剧（成人内容，请自行评估合规风险）
          </p>
        </div>
        <Button
          variant={enabled ? "default" : "outline"}
          disabled={enabled === null || pending}
          onClick={() => void toggle()}
        >
          {enabled ? "已开启" : "已关闭"}
        </Button>
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

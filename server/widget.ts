import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./config.ts";
import { getWidgetSource, upsertWidgetSource } from "./db.ts";

// Capy widget 是客户端脚本：用 vm 沙箱执行，桥接 Widget.http.get。
// 每个来源一个沙箱；脚本缓存到本地（上游挂了也能跑），后台每天刷新一次。

const REFRESH_INTERVAL = 24 * 3600 * 1000;

interface WidgetHttpResponse {
  ok: boolean;
  status: number;
  data: unknown;
}

const WIDGET_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

async function widgetHttpGet(url: string, opts?: { timeout?: number }): Promise<WidgetHttpResponse> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts?.timeout ?? 15000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": WIDGET_UA } });
    const text = await res.text();
    let data: unknown = text;
    try {
      data = JSON.parse(text);
    } catch {
      // 非 JSON 保持文本
    }
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

interface WidgetContext extends vm.Context {
  WidgetMetadata?: { id?: string; title?: string };
  [fn: string]: unknown;
}

function createSandbox(): WidgetContext {
  const sandbox = {
    Widget: { http: { get: widgetHttpGet } },
    console,
    fetch,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    btoa: (s: string) => Buffer.from(s, "binary").toString("base64"),
    atob: (s: string) => Buffer.from(s, "base64").toString("binary"),
  } as Record<string, unknown>;
  return vm.createContext(sandbox) as WidgetContext;
}

// 脚本内写死的 capy 地址替换为 widget 所在源站（不同来源可能挂在不同后端）
function patchCode(code: string, origin: string): string {
  return code.replace(
    /var CAPY_BACKEND_URL = "[^"]*";/,
    `var CAPY_BACKEND_URL = ${JSON.stringify(origin)};`,
  );
}

// ---- 元数据提取 ----

export interface WidgetCategory {
  id: string;
  label: string;
  fn: string;
  consts: Record<string, unknown>;
}

export interface WidgetMeta {
  label: string;
  categories: WidgetCategory[];
  searchFn: string | null;
  ranks: { id: string; label: string }[];
}

interface RawModule {
  id?: string;
  title?: string;
  functionName?: string;
  params?: { name?: string; type?: string; value?: unknown }[];
}

/** 从已执行的沙箱里读 WidgetMetadata，提取通用分类/搜索配置 */
function extractMeta(ctx: WidgetContext): WidgetMeta {
  const md = (ctx.WidgetMetadata ?? {}) as {
    title?: string;
    modules?: RawModule[];
    search?: { functionName?: string; params?: { name?: string; type?: string }[] };
  };
  const modules = Array.isArray(md.modules) ? md.modules : [];

  const categories: WidgetCategory[] = [];
  let searchFn: string | null = md.search?.functionName ?? null;
  modules.forEach((m, i) => {
    if (!m?.functionName || !m.title) return;
    const params = Array.isArray(m.params) ? m.params : [];
    const keywordParam = params.some((p) => p?.type === "input" && p?.name === "keyword");
    // 含 input 参数的 module 视为搜索/交互入口；无 page 参数的不是可翻页列表，都不做浏览分类
    const hasInput = params.some((p) => p?.type === "input");
    const hasPage = params.some((p) => p?.type === "page");
    if (keywordParam && !searchFn) searchFn = m.functionName;
    if (hasInput || !hasPage) return;
    const consts: Record<string, unknown> = {};
    for (const p of params) {
      if (p?.name && (p.type === "constant" || p.type === "enumeration") && p.value != null)
        consts[p.name] = p.value;
    }
    categories.push({ id: m.id ?? `m${i}`, label: m.title, fn: m.functionName, consts });
  });

  // 黄果系 widget 的排行榜：loadRanking({ranking, page})，保持现有榜单行为
  const ranks =
    typeof ctx.loadRanking === "function"
      ? [
          { id: "hot", label: "热播榜" },
          { id: "recommend", label: "推荐榜" },
          { id: "potential", label: "潜力榜" },
        ]
      : [];

  return { label: md.title ?? "", categories, searchFn, ranks };
}

async function fetchWidgetCode(url: string, cacheFile: string): Promise<string> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (res.ok) {
      const code = await res.text();
      if (code.includes("WidgetMetadata")) {
        fs.writeFileSync(cacheFile, code);
        return code;
      }
    }
    throw new Error(`widget 拉取失败 ${res.status}`);
  } catch (err) {
    // 网络失败回退本地缓存
    if (fs.existsSync(cacheFile)) return fs.readFileSync(cacheFile, "utf8");
    throw err;
  }
}

/** 拉取 widget 并提取元数据（添加来源 / 补 meta 时用） */
export async function fetchWidgetMeta(url: string): Promise<WidgetMeta> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`widget 拉取失败 ${res.status}`);
  const code = await res.text();
  if (!code.includes("WidgetMetadata")) throw new Error("不是有效的 widget 脚本");
  const ctx = createSandbox();
  const origin = new URL(url).origin;
  vm.runInContext(patchCode(code, origin), ctx, { filename: path.basename(url) });
  const meta = extractMeta(ctx);
  if (!meta.label) throw new Error("widget 缺少名称");
  return meta;
}

// ---- 沙箱缓存（按来源 id） ----

interface Entry {
  context: WidgetContext | null;
  loading: Promise<WidgetContext> | null;
  timer?: ReturnType<typeof setInterval>;
}

const entries = new Map<string, Entry>();

function getEntry(id: string): Entry {
  let e = entries.get(id);
  if (!e) {
    e = { context: null, loading: null };
    entries.set(id, e);
  }
  return e;
}

/** 来源变更后调用：丢弃沙箱，下次调用时重建；不传 id 则全部重置 */
export function resetWidget(id?: string) {
  if (id === undefined) {
    for (const e of entries.values()) {
      if (e.timer) clearInterval(e.timer);
      e.context = null;
      e.loading = null;
    }
    return;
  }
  const e = entries.get(id);
  if (!e) return;
  if (e.timer) clearInterval(e.timer);
  e.context = null;
  e.loading = null;
}

async function getContext(id: string): Promise<WidgetContext> {
  const source = getWidgetSource(id);
  if (!source) throw new Error(`来源不存在: ${id}`);
  const e = getEntry(id);
  if (e.context) return e.context;
  if (!e.loading) {
    e.loading = (async () => {
      const cacheFile = path.join(DATA_DIR, `widget-${id}.js`);
      const code = await fetchWidgetCode(source.url, cacheFile);
      const origin = new URL(source.url).origin;
      const build = () => {
        const ctx = createSandbox();
        vm.runInContext(patchCode(code, origin), ctx, { filename: `${id}.js` });
        return ctx;
      };
      const ctx = build();
      e.context = ctx;
      // meta 缺失时补（迁移的旧来源可能没有）
      if (!source.meta) {
        try {
          upsertWidgetSource({ ...source, meta: JSON.stringify(extractMeta(ctx)) });
        } catch {
          // 补 meta 失败不影响使用
        }
      }
      // 每日刷新 widget 脚本
      e.timer = setInterval(async () => {
        try {
          const fresh = await fetchWidgetCode(source.url, cacheFile);
          const next = createSandbox();
          vm.runInContext(patchCode(fresh, origin), next, { filename: `${id}.js` });
          e.context = next;
          upsertWidgetSource({ ...source, meta: JSON.stringify(extractMeta(next)) });
        } catch {
          // 刷新失败保留旧 context
        }
      }, REFRESH_INTERVAL);
      e.timer.unref();
      return ctx;
    })();
  }
  return e.loading;
}

/** 调用 widget 导出函数（位置参数），如 call("dsd", "searchProvider", { keyword, page }) */
export async function callWidget<T>(id: string, fn: string, ...args: unknown[]): Promise<T> {
  const ctx = await getContext(id);
  const f = ctx[fn];
  if (typeof f !== "function") throw new Error(`widget 函数不存在: ${fn}`);
  return (await (f as (...a: unknown[]) => Promise<T>).apply(ctx, args)) as T;
}

/** 预热（服务启动时调用，失败不阻塞） */
export function warmupWidgets(ids: string[]) {
  for (const id of ids)
    void getContext(id).catch((err) => console.warn(`[widget] ${id} 加载失败:`, err));
}

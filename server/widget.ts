import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./config.ts";
import { getUpstreamUrl } from "./db.ts";

// 黄果 widget 是 capy 客户端脚本：用 vm 沙箱执行，桥接 Widget.http.get。
// 脚本缓存到本地，启动时优先用缓存（capy 挂了也能跑），后台每天刷新一次。

const widgetUrl = () => `${getUpstreamUrl()}/widgets/huangguo.js`;
const CACHE_FILE = path.join(DATA_DIR, "huangguo-widget.js");
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
  WidgetMetadata?: { id: string; title: string };
  [fn: string]: unknown;
}

let context: WidgetContext | null = null;
let loading: Promise<WidgetContext> | null = null;

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

async function fetchWidgetCode(): Promise<string> {
  try {
    const res = await fetch(widgetUrl(), { signal: AbortSignal.timeout(15000) });
    if (res.ok) {
      const code = await res.text();
      if (code.includes("WidgetMetadata")) {
        fs.writeFileSync(CACHE_FILE, code);
        return code;
      }
    }
    throw new Error(`widget 拉取失败 ${res.status}`);
  } catch (err) {
    // 网络失败回退本地缓存
    if (fs.existsSync(CACHE_FILE)) return fs.readFileSync(CACHE_FILE, "utf8");
    throw err;
  }
}

// 脚本内写死的 capy 地址替换为当前配置的上游
function patchCode(code: string): string {
  return code.replace(
    /var CAPY_BACKEND_URL = "[^"]*";/,
    `var CAPY_BACKEND_URL = ${JSON.stringify(getUpstreamUrl())};`,
  );
}

/** 上游地址变更后调用：丢弃当前 context，下次调用时重建 */
export function resetWidget() {
  context = null;
  loading = null;
}
async function getContext(): Promise<WidgetContext> {
  if (context) return context;
  if (!loading) {
    loading = (async () => {
      const code = await fetchWidgetCode();
      const ctx = createSandbox();
      vm.runInContext(patchCode(code), ctx, { filename: "huangguo.js" });
      context = ctx;
      // 每日刷新 widget 脚本
      setInterval(async () => {
        try {
          const fresh = await fetchWidgetCode();
          const next = createSandbox();
          vm.runInContext(patchCode(fresh), next, { filename: "huangguo.js" });
          context = next;
        } catch {
          // 刷新失败保留旧 context
        }
      }, REFRESH_INTERVAL).unref();
      return ctx;
    })();
  }
  return loading;
}

/** 调用 widget 导出函数（位置参数），如 call("searchVideos", { keyword, page }) */
export async function callWidget<T>(fn: string, ...args: unknown[]): Promise<T> {
  const ctx = await getContext();
  const f = ctx[fn];
  if (typeof f !== "function") throw new Error(`widget 函数不存在: ${fn}`);
  return (await (f as (...a: unknown[]) => Promise<T>).apply(ctx, args)) as T;
}

/** 预热（服务启动时调用，失败不阻塞） */
export function warmupWidget() {
  void getContext().catch((err) => console.warn("[widget] 黄果 widget 加载失败:", err));
}

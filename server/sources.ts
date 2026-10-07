import {
  listWidgetSources,
  userSourceAllowed,
  type WidgetSource,
} from "./db.ts";
import type { WidgetMeta } from "./widget.ts";

// 所有源都来自管理面板添加的 widget 链接（红果也是：Capy 上的 hongguo.js）。
// 前端的数据源注册表完全由这里下发。

export interface SourceConfig {
  id: string;
  label: string;
  apiBase: string;
  categories: { id: string; label: string }[];
  ranks: { id: string; label: string }[];
  hotRank: string;
  nsfw: boolean;
  allowed: boolean;
}

function parseMeta(s: WidgetSource): WidgetMeta {
  if (!s.meta) return { label: s.label, categories: [], searchFn: null, ranks: [] };
  try {
    return JSON.parse(s.meta) as WidgetMeta;
  } catch {
    return { label: s.label, categories: [], searchFn: null, ranks: [] };
  }
}

function toConfig(s: WidgetSource, uid: number): SourceConfig {
  const meta = parseMeta(s);
  const categories = meta.categories.map((c) => ({ id: c.id, label: c.label }));
  return {
    id: s.id,
    label: meta.label || s.label,
    apiBase: `/api/widgets/${s.id}`,
    categories,
    ranks: meta.ranks,
    hotRank: categories[0]?.id ?? "",
    nsfw: s.nsfw === 1,
    allowed: userSourceAllowed(uid, s.id, s.nsfw),
  };
}

/** 当前用户可见的源列表（已启用的源；非成人源排前面） */
export function visibleSources(uid: number): SourceConfig[] {
  return listWidgetSources()
    .filter((s) => s.enabled)
    .map((s) => toConfig(s, uid));
}

/** 用户能否使用该源：须存在、已启用、且被授权（每用户×每源开关，默认非成人源开放） */
export function canUseSource(uid: number, id: string): boolean {
  const s = listWidgetSources().find((w) => w.id === id && w.enabled);
  if (!s) return false;
  return userSourceAllowed(uid, s.id, s.nsfw);
}

/** 收藏/历史写入时的 source 归一化：合法源原样存，否则记 fallback */
export function normalizeSource(uid: number, v: unknown): string {
  return typeof v === "string" && canUseSource(uid, v) ? v : fallbackSourceId(uid);
}

/** 回落源：第一个可用源 */
export function fallbackSourceId(uid: number): string {
  return (
    visibleSources(uid).find((s) => s.allowed)?.id ??
    visibleSources(uid)[0]?.id ??
    "hongguo"
  );
}

/** 该用户当前 source 是否仍可用（不可用时调用方负责回落） */
export function sourceStillValid(uid: number, source: string): boolean {
  return canUseSource(uid, source);
}

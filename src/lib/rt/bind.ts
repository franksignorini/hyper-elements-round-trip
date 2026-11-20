// Provenance: which template value (or which literal in the JSX) put each word
// into each builder block. We render the template a second time with every string
// in the data swapped for a numbered token. toDesign() is deterministic, so block
// ids line up with the real design, and each field's text becomes a pattern like
// "qq7qq · qq8qq" that maps an edit straight back to its data paths.
import { blocksOf, type Design } from "./design";

export type Path = (string | number)[];
export interface Sentinel {
  data: unknown;
  paths: Path[];
}

const URLISH = /^(https?:)?\/\//i;
export const TOKEN = /(?:https:\/\/rt\.bind\/)?qq(\d+)qq/gi;

export function sentinelize(data: unknown): Sentinel {
  const paths: Path[] = [];
  const walk = (value: unknown, path: Path): unknown => {
    if (typeof value === "string") {
      if (value === "") return value; // keeps `{value && …}` conditions the same
      const n = paths.push(path) - 1;
      return URLISH.test(value) ? `https://rt.bind/qq${n}qq` : `qq${n}qq`;
    }
    if (Array.isArray(value)) return value.map((v, i) => walk(v, [...path, i]));
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v, [...path, k])]));
    }
    return value;
  };
  return { data: walk(data, []), paths };
}

/** Per block id, per field: the field's text with tokens where data went in. */
export type Bindings = Map<string, { type: string; fields: Record<string, string> }>;

export function bindingsOf(sentinelDesign: Design): Bindings {
  const map: Bindings = new Map();
  for (const block of blocksOf(sentinelDesign)) map.set(block.id, { type: block.type, fields: block.fields });
  return map;
}

export function tokensIn(pattern: string): number[] {
  return [...pattern.matchAll(TOKEN)].map((m) => Number(m[1]));
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Reads the data values back out of a field's new text, or null if its literal parts changed. */
export function matchPattern(pattern: string, text: string): string[] | null {
  const parts = pattern.split(new RegExp(TOKEN.source, "i"));
  // split() with one capture group interleaves: literal, n, literal, n, literal…
  let source = "^";
  for (let i = 0; i < parts.length; i++) source += i % 2 ? "([\\s\\S]*?)" : escape(parts[i]);
  source += "$";
  const m = new RegExp(source).exec(text);
  return m ? m.slice(1) : null;
}

export function getAt(data: unknown, path: Path): unknown {
  return path.reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[k as string] : undefined), data);
}

export function setAt<T>(data: T, path: Path, value: unknown): T {
  if (!path.length) return value as T;
  const [head, ...rest] = path;
  const clone = (Array.isArray(data) ? [...data] : { ...(data as object) }) as Record<string | number, unknown>;
  clone[head] = setAt((data as Record<string | number, unknown>)[head], rest, value);
  return clone as T;
}

export function formatPath(path: Path): string {
  return path.reduce<string>((s, k) => (typeof k === "number" ? `${s}[${k}]` : s ? `${s}.${k}` : k), "");
}

/** "values.features[1].title" -> ["values", "features", 1, "title"] */
export function parsePath(text: string): Path {
  return [...text.matchAll(/([^.[\]]+)|\[(\d+)\]/g)].map((m) => (m[2] !== undefined ? Number(m[2]) : m[1]));
}

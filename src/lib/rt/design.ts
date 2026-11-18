// Reads an Unlayer design (from toDesign() or from the builder) as a flat list of
// blocks, each with the few text-like fields a person edits: its words, links and
// image. Everything else (padding, colors) is the builder's business.

export type Json = Record<string, unknown>;
export interface Design {
  body: { rows: Json[]; values?: Json };
  counters?: Json;
  schemaVersion?: number;
}

export interface Block {
  id: string;
  type: string;
  /** Position in the design: row, column, index in the column. */
  at: [number, number, number];
  fields: Record<string, string>;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  rarr: "→",
  larr: "←",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
  middot: "·",
  mdash: "—",
  ndash: "–",
  hellip: "…",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === "#") {
      const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

/** One line per paragraph, single spaces, no stray non-breaking spaces. */
export function normalizeText(s: string): string {
  return s
    .replace(/ /g, " ")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line, i, all) => line !== "" || (i > 0 && i < all.length - 1))
    .join("\n")
    .trim();
}

function htmlText(html: string, links: string[]): string {
  html.replace(/<a\b[^>]*\bhref\s*=\s*"([^"]*)"/gi, (_, href: string) => {
    links.push(decodeEntities(href));
    return "";
  });
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|h[1-6]|div)>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return normalizeText(decodeEntities(text));
}

interface LexNode {
  type?: string;
  text?: string;
  url?: string;
  children?: LexNode[];
  fields?: { url?: string };
}

const BLOCK_NODES = /paragraph|heading|listitem|quote/;

function lexicalText(json: string, links: string[]): string | null {
  let root: LexNode;
  try {
    root = (JSON.parse(json) as { root: LexNode }).root;
  } catch {
    return null;
  }
  const out: string[] = [];
  const walk = (node: LexNode) => {
    if (typeof node.text === "string") out.push(node.text);
    if (node.type === "linebreak") out.push("\n");
    const url = node.url ?? node.fields?.url;
    if (/link/.test(node.type ?? "") && url) links.push(url);
    for (const child of node.children ?? []) walk(child);
    if (BLOCK_NODES.test(node.type ?? "")) out.push("\n");
  };
  walk(root);
  return normalizeText(out.join(""));
}

function textOf(values: Json, links: string[]): string {
  if (typeof values.textJson === "string") {
    const text = lexicalText(values.textJson, links);
    if (text !== null) return text;
  }
  if (typeof values.text === "string") return htmlText(values.text, links);
  return "";
}

const get = (o: unknown, ...path: (string | number)[]): unknown =>
  path.reduce<unknown>((acc, key) => (acc && typeof acc === "object" ? (acc as Json)[key as string] : undefined), o);

export function fieldsOf(content: Json): Record<string, string> {
  const type = String(content.type);
  const values = (content.values ?? {}) as Json;
  const fields: Record<string, string> = {};
  const links: string[] = [];
  switch (type) {
    case "heading":
    case "paragraph":
    case "text":
      fields.text = textOf(values, links);
      break;
    case "button": {
      fields.text = textOf(values, []);
      const href = get(values, "href", "values", "href");
      if (typeof href === "string") fields.href = href;
      break;
    }
    case "image": {
      const src = get(values, "src", "url");
      if (typeof src === "string") fields.src = src;
      if (typeof values.altText === "string") fields.alt = values.altText;
      const href = get(values, "action", "values", "href");
      if (typeof href === "string" && href) fields.href = href;
      break;
    }
    case "menu": {
      const items = (get(values, "menu", "items") as Json[] | undefined) ?? [];
      items.forEach((item, i) => {
        fields[`item${i}`] = normalizeText(String(item.text ?? ""));
        const href = get(item, "link", "values", "href");
        if (typeof href === "string") fields[`item${i}.href`] = href;
      });
      break;
    }
    case "social": {
      const icons = (get(values, "icons", "icons") as Json[] | undefined) ?? [];
      icons.forEach((icon, i) => {
        if (typeof icon.url === "string") fields[`icon${i}`] = icon.url;
      });
      break;
    }
    case "html":
      if (typeof values.html === "string") fields.html = values.html;
      break;
  }
  links.forEach((href, i) => (fields[`link${i}`] = href));
  return fields;
}

export function blocksOf(design: Design): Block[] {
  const blocks: Block[] = [];
  const seen = new Map<string, number>();
  design.body.rows.forEach((row, r) => {
    ((row.columns as Json[]) ?? []).forEach((column, c) => {
      ((column.contents as Json[]) ?? []).forEach((content, i) => {
        const meta = get(content, "values", "_meta", "htmlID");
        let id = typeof meta === "string" ? meta : `u_${String(content.type)}_${r}_${c}_${i}`;
        // A block duplicated in the builder can carry its original's id: keep ids unique.
        const n = seen.get(id) ?? 0;
        seen.set(id, n + 1);
        if (n) id = `${id}~${n}`;
        blocks.push({ id, type: String(content.type), at: [r, c, i], fields: fieldsOf(content) });
      });
    });
  });
  return blocks;
}

export const EDITABLE = new Set(["heading", "paragraph", "text", "button", "image", "menu", "social"]);

export function blockLabel(block: Block): string {
  const text = block.fields.text ?? block.fields.alt ?? block.fields.item0 ?? "";
  return text.length > 48 ? `${text.slice(0, 46)}…` : text;
}

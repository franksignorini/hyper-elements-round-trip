// "Spot the difference" for two renders of the same email.
// A pixel blend falls apart as soon as an edit reflows the layout (a shorter
// headline moves everything below it), so this diffs what the reader sees
// instead: the visible text runs and images, in reading order, aligned with an
// LCS. Each changed run is marked on the new render with what it said before,
// and everything else is dimmed.

interface Token {
  key: string;
  node: Node;
  text: string;
}

const SKIP = new Set(["HEAD", "STYLE", "SCRIPT", "TITLE", "NOSCRIPT"]);

function tokens(doc: Document): Token[] {
  const out: Token[] = [];
  if (!doc.body) return out;
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (n) => (n.nodeType === 1 && SKIP.has((n as Element).tagName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === 3) {
      const text = (n.textContent ?? "").replace(/\s+/g, " ").trim();
      if (text) out.push({ key: `t:${text}`, node: n, text });
    } else if ((n as Element).tagName === "IMG") {
      const img = n as HTMLImageElement;
      out.push({ key: `i:${img.getAttribute("src") ?? ""}`, node: n, text: img.getAttribute("alt") || "an image" });
    }
  }
  return out;
}

type Op = { kind: "same"; a: Token; b: Token } | { kind: "del"; a: Token } | { kind: "add"; b: Token };

function align(a: Token[], b: Token[]): Op[] {
  const n = a.length;
  const m = b.length;
  const w = m + 1;
  const table = new Uint16Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * w + j] = a[i].key === b[j].key ? table[(i + 1) * w + j + 1] + 1 : Math.max(table[(i + 1) * w + j], table[i * w + j + 1]);
    }
  }
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i].key === b[j].key) ops.push({ kind: "same", a: a[i++], b: b[j++] });
    else if (table[(i + 1) * w + j] >= table[i * w + j + 1]) ops.push({ kind: "del", a: a[i++] });
    else ops.push({ kind: "add", b: b[j++] });
  }
  while (i < n) ops.push({ kind: "del", a: a[i++] });
  while (j < m) ops.push({ kind: "add", b: b[j++] });
  return ops;
}

interface Hunk {
  removed: Token[];
  added: Token[];
  /** The next unchanged token in the new render, to pin a pure deletion to. */
  anchor?: Token;
}

function hunks(ops: Op[]): Hunk[] {
  const out: Hunk[] = [];
  let open: Hunk | null = null;
  for (const op of ops) {
    if (op.kind === "same") {
      if (open) {
        open.anchor = op.b;
        out.push(open);
        open = null;
      }
      continue;
    }
    open ??= { removed: [], added: [] };
    if (op.kind === "del") open.removed.push(op.a);
    else open.added.push(op.b);
  }
  if (open) out.push(open);
  return out;
}

/** The differing middle of two strings, widened to whole words. */
function wordDiff(before: string, after: string) {
  const isWord = (c: string | undefined) => c !== undefined && /\S/.test(c);
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let end = 0;
  while (end < before.length - start && end < after.length - start && before[before.length - 1 - end] === after[after.length - 1 - end]) end++;
  // The prefix is shared, so stepping back to a word start moves both strings alike.
  while (start > 0 && isWord(after[start - 1]) && (isWord(after[start]) || isWord(before[start]))) start--;
  let afterEnd = after.length - end;
  let beforeEnd = before.length - end;
  while (afterEnd < after.length && isWord(after[afterEnd]) && (isWord(after[afterEnd - 1]) || isWord(before[beforeEnd - 1]))) {
    afterEnd++;
    beforeEnd++;
  }
  return { start, afterEnd, was: before.slice(start, beforeEnd).trim() };
}

function rectsOf(token: Token, from = 0, to?: number): DOMRect[] {
  const doc = token.node.ownerDocument!;
  if (token.node.nodeType !== 3) return [(token.node as Element).getBoundingClientRect()];
  const raw = token.node.textContent ?? "";
  const range = doc.createRange();
  if (to === undefined) {
    range.selectNodeContents(token.node);
  } else {
    // Offsets are in the whitespace-collapsed text; map them back to the raw node.
    const map: number[] = [];
    let collapsed = "";
    for (let k = 0; k < raw.length; k++) {
      const c = /\s/.test(raw[k]) ? " " : raw[k];
      if (c === " " && (collapsed.endsWith(" ") || collapsed === "")) continue;
      map.push(k);
      collapsed += c;
    }
    range.setStart(token.node, map[from] ?? 0);
    range.setEnd(token.node, (map[to - 1] ?? raw.length - 1) + 1);
  }
  return [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
}

const clip = (s: string, n = 34) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export interface SpotResult {
  count: number;
  /** Document y of the first mark, to scroll it into view. */
  firstY: number | null;
}

/** Marks what changed between `beforeHtml` and the document `doc` (the new render). */
export function spotChanges(doc: Document, beforeHtml: string): SpotResult {
  doc.querySelector("[data-rt-spot]")?.remove();
  const before = new DOMParser().parseFromString(beforeHtml, "text/html");
  const win = doc.defaultView!;
  const sx = win.scrollX;
  const sy = win.scrollY;

  const marks: { rects: DOMRect[]; label: string; kind: "change" | "add" | "del" }[] = [];
  for (const h of hunks(align(tokens(before), tokens(doc)))) {
    if (h.added.length) {
      if (h.removed.length === 1 && h.added.length === 1 && h.added[0].node.nodeType === 3 && h.removed[0].node.nodeType === 3) {
        const d = wordDiff(h.removed[0].text, h.added[0].text);
        const rects = d.afterEnd > d.start ? rectsOf(h.added[0], d.start, d.afterEnd) : rectsOf(h.added[0]);
        marks.push({ rects, label: d.was ? `was “${clip(d.was)}”` : "added", kind: d.was ? "change" : "add" });
      } else {
        const rects = h.added.flatMap((t) => rectsOf(t));
        const was = h.removed.map((t) => t.text).join(" ");
        marks.push({ rects, label: was ? `was “${clip(was)}”` : "new", kind: was ? "change" : "add" });
      }
    } else if (h.removed.length && h.anchor) {
      const r = rectsOf(h.anchor)[0];
      if (r) marks.push({ rects: [new DOMRect(r.left, r.top - 6, Math.max(r.width, 80), 3)], label: `removed “${clip(h.removed.map((t) => t.text).join(" "))}”`, kind: "del" });
    }
  }

  const visible = marks.filter((m) => m.rects.length);
  const width = doc.documentElement.scrollWidth;
  const height = doc.documentElement.scrollHeight;
  const pad = 4;
  const boxes = visible.map((m) => ({
    ...m,
    boxes: m.rects.map((r) => ({ x: r.left + sx - pad, y: r.top + sy - pad, w: r.width + pad * 2, h: r.height + pad * 2 })),
  }));

  const holes = boxes.flatMap((m) => m.boxes).map((b) => `M${b.x} ${b.y}h${b.w}v${b.h}h${-b.w}Z`).join("");
  const layer = doc.createElement("div");
  layer.setAttribute("data-rt-spot", "");
  layer.setAttribute("aria-hidden", "true");
  layer.style.cssText = `position:absolute;left:0;top:0;width:${width}px;height:${height}px;pointer-events:none;z-index:2147483647;`;
  layer.innerHTML = `
<style>
  @keyframes rtSpotDim { from { opacity: 0 } }
  @keyframes rtSpotDraw { from { stroke-dashoffset: 400 } }
  @keyframes rtSpotTag { from { opacity: 0; transform: translateY(6px) rotate(-6deg) scale(.6) } }
  [data-rt-spot] .dim { animation: rtSpotDim .5s ease-out both }
  [data-rt-spot] .box { stroke-dasharray: 400; animation: rtSpotDraw .7s .25s cubic-bezier(.2,.7,.2,1) both }
  [data-rt-spot] .tag { position: absolute; transform-origin: 0 100%; animation: rtSpotTag .45s .55s cubic-bezier(.2,1.6,.4,1) both;
    font: 700 12px/1 ui-monospace, "JetBrains Mono", Menlo, monospace; letter-spacing: .02em; white-space: nowrap;
    padding: 5px 8px 4px; border-radius: 4px; border: 1.5px solid #1d1b17; box-shadow: 2px 2px 0 #1d1b17 }
</style>
<svg width="${width}" height="${height}" style="position:absolute;inset:0;overflow:visible">
  <path class="dim" fill="rgba(239,233,221,.78)" fill-rule="evenodd" d="M0 0H${width}V${height}H0Z${holes}"/>
  ${boxes
    .flatMap((m) =>
      m.boxes.map(
        (b) =>
          `<rect class="box" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="3" fill="${m.kind === "del" ? "#ff5a2c" : "rgba(255,90,44,.16)"}" stroke="#ff5a2c" stroke-width="2.5"/>`,
      ),
    )
    .join("")}
</svg>
${boxes
  .map((m) => {
    const b = m.boxes[0];
    const above = b.y > 30;
    const top = above ? b.y - 26 : b.y + b.h + 6;
    const left = Math.max(4, Math.min(b.x, width - 260));
    const bg = m.kind === "add" ? "#2b45ff" : "#ff5a2c";
    const fg = m.kind === "add" ? "#fff" : "#1d1b17";
    return `<span class="tag" style="left:${left}px;top:${top}px;background:${bg};color:${fg}"></span>`;
  })
  .join("")}`;
  // Labels quote the old copy: set them as text, never as markup.
  layer.querySelectorAll<HTMLElement>(".tag").forEach((tag, k) => {
    tag.textContent = boxes[k].label;
  });
  doc.body.appendChild(layer);

  const firstY = boxes.length ? Math.min(...boxes.map((m) => m.boxes[0].y)) : null;
  return { count: boxes.length, firstY };
}

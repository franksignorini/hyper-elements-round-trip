// Round-trip self-test, no browser: the invariants the engine depends on.
//   npm run selftest  [-- --save out/design-baseline.json] [-- --compare out/design-baseline.json]
// 1. toDesign() is deterministic (two builds, identical JSON).
// 2. Every block carries _meta.htmlID, and the traced (sentinel) render has the same ids.
// 3. A copy edit, a code-text edit and an image swap each come back as the right patch,
//    the JSON diff is one line, and a rebuild from the patched files matches the edit.
import { readFile, writeFile } from "node:fs/promises";
import { build, pull, type Change } from "../src/lib/rt/engine";
import { blocksOf, type Design, type Json } from "../src/lib/rt/design";
import { tokensIn } from "../src/lib/rt/bind";

const FILES = ["Newsletter.tsx", "theme.ts", "issue.json"];
const ASSET_BASE = "https://franksignorini.github.io/hyper-elements-round-trip";
let failures = 0;
const ok = (cond: boolean, label: string, detail = "") => {
  console.log(`${cond ? "✓" : "✗"} ${label}${detail ? `  ${detail}` : ""}`);
  if (!cond) failures++;
};

const files: Record<string, string> = {};
for (const f of FILES) files[f] = (await readFile(`template/${f}`, "utf8")).replace(/\r\n/g, "\n");

// 1. Determinism
const a = build(files, ASSET_BASE);
const b = build(files, ASSET_BASE);
ok(JSON.stringify(a.design) === JSON.stringify(b.design), "toDesign() is deterministic", `${a.blocks.length} blocks, schemaVersion ${a.design.schemaVersion}`);

// 2. htmlIDs
// blocksOf() falls back to u_<type>_<row>_<col>_<i> when a block has no _meta.htmlID.
const metaIds = a.blocks.filter((bl) => !/^u_(heading|paragraph|text|button|image|menu|social|html|divider|spacer)_\d+_\d+_\d+$/.test(bl.id));
ok(metaIds.length === a.blocks.length, "every block has _meta.htmlID", `${metaIds.length}/${a.blocks.length}`);
ok(a.bindings.size > 0, "traced render binds blocks to data", `${a.bindings.size} bound blocks`);
const unknownBinding = [...a.bindings.keys()].filter((id) => !a.blocks.some((bl) => bl.id === id));
ok(unknownBinding.length === 0, "traced ids match real ids", unknownBinding.length ? unknownBinding.slice(0, 5).join(", ") : "");

const args = process.argv.slice(2);
const saveAt = args.indexOf("--save");
if (saveAt >= 0) await writeFile(args[saveAt + 1], `${JSON.stringify(a.design, null, 2)}\n`);
const cmpAt = args.indexOf("--compare");
if (cmpAt >= 0) {
  const base = JSON.parse(await readFile(args[cmpAt + 1], "utf8")) as Design;
  const baseBlocks = blocksOf(base);
  const ids = (list: { id: string }[]) => list.map((x) => x.id).join();
  ok(ids(baseBlocks) === ids(a.blocks), "same block ids and order as baseline", `${baseBlocks.length} → ${a.blocks.length}`);
  const fieldDiffs = a.blocks.filter((bl, i) => JSON.stringify(bl.fields) !== JSON.stringify(baseBlocks[i]?.fields));
  ok(fieldDiffs.length === 0, "same editable fields as baseline", fieldDiffs.map((d) => `${d.type}:${d.id}`).slice(0, 6).join(", "));
  console.log(`  design JSON identical to baseline: ${JSON.stringify(base) === JSON.stringify(a.design)}`);
}

// 3. Edits
function editDesign(design: Design, id: string, mutate: (values: string) => string): Design {
  const copy = JSON.parse(JSON.stringify(design)) as Design;
  for (const row of copy.body.rows)
    for (const col of (row.columns as Json[]) ?? [])
      for (const content of (col.contents as Json[]) ?? []) {
        const meta = ((content.values as Json)?._meta as Json | undefined)?.htmlID;
        if (meta === id) content.values = JSON.parse(mutate(JSON.stringify(content.values)));
      }
  return copy;
}
function lineDiff(x: string, y: string) {
  const xs = x.split("\n"), ys = y.split("\n");
  return xs.filter((l, i) => l !== ys[i]).length + Math.abs(xs.length - ys.length);
}
function roundTrip(label: string, id: string, mutate: (v: string) => string, expect: Change["kind"], file: string) {
  const edited = editDesign(a.design, id, mutate);
  const result = pull(a, edited);
  const kinds = result.changes.map((c) => c.kind);
  ok(kinds.length === 1 && kinds[0] === expect, `${label}: one ${expect} change`, JSON.stringify(result.changes.map((c) => ({ ...c, rawPath: undefined }))).slice(0, 220));
  const lines = lineDiff(files[file], result.files[file]);
  ok(lines === 1, `${label}: ${file} diff is one line`, `${lines} line(s)`);
  // Rebuild from the patched files: the builder should now show exactly the edit.
  const again = build(result.files, ASSET_BASE);
  const repull = pull(again, edited);
  ok(repull.changes.length === 0, `${label}: rebuilt template agrees with the builder`, repull.changes.length ? JSON.stringify(repull.changes).slice(0, 200) : "");
}

const word = /\b([A-Za-z]{5,})\b/;
const textBlocks = a.blocks.filter((bl) => ["heading", "text", "paragraph"].includes(bl.type) && bl.fields.text);
const copyBlock = textBlocks.find((bl) => {
  const p = a.bindings.get(bl.id)?.fields.text;
  return p && tokensIn(p).length === 1 && word.test(bl.fields.text);
});
// Text written whole in the JSX (not spread across markup), like "On the runway".
const codeBlock = textBlocks.find(
  (bl) => !a.bindings.get(bl.id)?.fields.text?.match(/qq\d+qq/) && word.test(bl.fields.text) && files["Newsletter.tsx"].includes(bl.fields.text),
);
const imageBlock = a.blocks.find((bl) => bl.type === "image" && a.bindings.get(bl.id)?.fields.src);

if (copyBlock) {
  const w = copyBlock.fields.text.match(word)![1];
  roundTrip(`copy edit “${w}” in ${copyBlock.type}`, copyBlock.id, (v) => v.split(w).join("Zebra"), "copy", "issue.json");
} else ok(false, "found a copy block to edit");
if (codeBlock) {
  const w = codeBlock.fields.text.match(word)![1];
  roundTrip(`code-text edit “${w}”`, codeBlock.id, (v) => v.split(w).join("Zebra"), "code", "Newsletter.tsx");
} else ok(false, "found a code-text block to edit");
if (imageBlock) {
  const src = imageBlock.fields.src;
  roundTrip("image swap", imageBlock.id, (v) => v.split(JSON.stringify(src).slice(1, -1)).join("https://example.com/new.png"), "copy", "issue.json");
} else console.log("- no data-bound image to swap");

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exitCode = failures ? 1 : 0;

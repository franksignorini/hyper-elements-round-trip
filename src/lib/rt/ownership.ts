// Who owns each block of the design, read from the provenance trace.
import { formatPath, tokensIn } from "./bind";
import { blockLabel, EDITABLE, type Block } from "./design";
import type { Snapshot } from "./engine";

export type Owner = "copy" | "code-text" | "locked" | "fixed";

export interface Owned {
  block: Block;
  owner: Owner;
  paths: string[];
  /** The same paths as data paths, to find them in issue.json. */
  rawPaths: (string | number)[][];
  label: string;
}

export const OWNER_INFO: Record<Owner, { name: string; hint: string }> = {
  copy: { name: "Copy", hint: "Words from issue.json. Edit them in the builder: they come back as a JSON diff." },
  "code-text": { name: "Code text", hint: "Words written in the JSX. Builder edits patch Newsletter.tsx." },
  locked: { name: "Locked", hint: "No builder tool for it (a Layer, a custom element): moved, not edited." },
  fixed: { name: "Fixed", hint: "Dividers, menus and icons the template sets. Edits are reported, not synced." },
};

export function ownership(snapshot: Snapshot): Owned[] {
  return snapshot.blocks.map((block) => {
    if (block.type === "html") return { block, owner: "locked", paths: [], rawPaths: [], label: lockedLabel(block, snapshot) };
    const binding = snapshot.bindings.get(block.id);
    const tokens = [...new Set(Object.values(binding?.fields ?? {}).flatMap(tokensIn))];
    const rawPaths = tokens.map((n) => snapshot.paths[n]);
    const paths = [...new Set(rawPaths.map(formatPath))];
    if (paths.length) return { block, owner: "copy", paths, rawPaths, label: blockLabel(block) || block.type };
    if (EDITABLE.has(block.type) && block.type !== "menu" && block.type !== "social" && block.fields.text)
      return { block, owner: "code-text", paths: [], rawPaths: [], label: blockLabel(block) };
    return { block, owner: "fixed", paths: [], rawPaths: [], label: blockLabel(block) || block.type };
  });
}

function lockedLabel(block: Block, snapshot: Snapshot): string {
  const index = snapshot.blocks.filter((b) => b.type === "html").indexOf(block);
  const line = snapshot.report.filter((r) => /HTML block/.test(r))[index];
  const what = line?.match(/an? ([\w.]+) isn't a tool/)?.[1];
  return what ? `${what} (HTML block)` : "HTML block";
}

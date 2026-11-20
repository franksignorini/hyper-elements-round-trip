// Who owns each block of the design, read from the provenance trace, and for
// copy, which template field it is: its label and guidance from describe().
import { formatPath, tokensIn } from "./bind";
import { blockLabel, EDITABLE, type Block } from "./design";
import type { Snapshot } from "./engine";

export type Owner = "copy" | "code-text" | "locked" | "fixed";

export interface FieldInfo {
  /** "features[1].title" */
  path: string;
  /** The template's label for it: "Feature name". */
  label: string;
  guidance?: string;
  maxLength?: number;
}

export interface Owned {
  block: Block;
  owner: Owner;
  paths: string[];
  /** The same paths as data paths, to find them in the values file. */
  rawPaths: (string | number)[][];
  /** The template fields behind a copy block. */
  fields: FieldInfo[];
  label: string;
}

export const OWNER_INFO: Record<Owner, { name: string; hint: string }> = {
  copy: { name: "Copy", hint: "The template's fields, in issue.values.json. Edit them in the builder: they come back as a JSON diff, checked by the template." },
  "code-text": { name: "Code text", hint: "Words written in the JSX. Builder edits patch Newsletter.tsx." },
  locked: { name: "Locked", hint: "No builder tool for it (a Layer, a custom element): moved, not edited." },
  fixed: { name: "Fixed", hint: "Dividers, menus and icons the template sets. Edits are reported, not synced." },
};

/** A value's field in the template's description: "features[1].title" is "features[].title". */
export function fieldInfo(snapshot: Snapshot, path: string): FieldInfo {
  const general = path.replace(/\[\d+\]/g, "[]");
  const found = snapshot.description.fields.find((f) => f.path === general);
  // An image's src is the image field itself.
  const parent = found ? undefined : snapshot.description.fields.find((f) => general.startsWith(`${f.path}.`) && f.kind === "image");
  const f = found ?? parent;
  const max = (f?.schema as { maxLength?: number } | undefined)?.maxLength;
  return { path, label: f?.label ?? path, guidance: f?.guidance, maxLength: typeof max === "number" ? max : undefined };
}

export function ownership(snapshot: Snapshot): Owned[] {
  return snapshot.blocks.map((block) => {
    if (block.type === "html")
      return { block, owner: "locked", paths: [], rawPaths: [], fields: [], label: lockedLabel(block, snapshot) };
    const binding = snapshot.bindings.get(block.id);
    const tokens = [...new Set(Object.values(binding?.fields ?? {}).flatMap(tokensIn))];
    const rawPaths = tokens.map((n) => snapshot.paths[n]);
    const paths = [...new Set(rawPaths.map(formatPath))];
    if (paths.length)
      return { block, owner: "copy", paths, rawPaths, fields: paths.map((p) => fieldInfo(snapshot, p)), label: blockLabel(block) || block.type };
    if (EDITABLE.has(block.type) && block.type !== "menu" && block.type !== "social" && block.fields.text)
      return { block, owner: "code-text", paths: [], rawPaths: [], fields: [], label: blockLabel(block) };
    return { block, owner: "fixed", paths: [], rawPaths: [], fields: [], label: blockLabel(block) || block.type };
  });
}

function lockedLabel(block: Block, snapshot: Snapshot): string {
  const index = snapshot.blocks.filter((b) => b.type === "html").indexOf(block);
  const line = snapshot.report.filter((r) => /HTML block/.test(r))[index];
  const what = line?.match(/an? ([\w.]+) isn't a tool/)?.[1];
  return what ? `${what} (HTML block)` : "HTML block";
}

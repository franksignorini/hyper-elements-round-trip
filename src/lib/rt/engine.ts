// The round trip itself.
//   push: values file -> template.check() -> template.design() -> toDesign() -> builder design (+ provenance)
//   pull: edited builder design -> patches to issue.values.json and Newsletter.tsx, re-checked by the template
import type { ReactElement } from "react";
import { fromDesign, toDesign } from "@hyper-elements/react/builder";
import { readValuesFile, type TemplateDescription } from "@hyper-elements/react/template";
import { compileTemplate, type Files, type Template } from "./compile";
import { blocksOf, blockLabel, EDITABLE, normalizeText, type Block, type Design } from "./design";
import { bindingsOf, formatPath, getAt, matchPattern, sentinelize, setAt, tokensIn, type Bindings, type Path } from "./bind";
import { patchJsonValue } from "./jsonText";

export const ENTRY = "Newsletter.tsx";
/** A Hyper Elements values file: { version, template, values }. */
export const DATA = "issue.values.json";
/** A value's path in the values file: the template's values sit under "values". */
export const filePath = (path: Path): Path => ["values", ...path];

type Values = Record<string, unknown>;
interface Diagnostic {
  severity: string;
  code: string;
  message: string;
  path?: string;
}

/** Values the template refuses. `path` is where, as the template says it ("values.hero.title"). */
export class ValuesError extends Error {
  constructor(
    readonly diagnostics: Diagnostic[],
  ) {
    const first = diagnostics[0];
    super(`${DATA}: ${first?.message ?? "the template refused these values"}${first?.path ? ` (at ${first.path})` : ""}`);
  }
}

export interface Snapshot {
  files: Files;
  template: Template;
  /** The template's values, as checked. */
  issue: Values;
  element: ReactElement;
  design: Design;
  report: string[];
  blocks: Block[];
  bindings: Bindings;
  paths: Path[];
  /** What the template asks a reviewer to look at: each field's guidance. */
  review: { field?: string; template?: string; guidance: string }[];
  /** The template's own account of its fields: labels, guidance, limits. */
  description: TemplateDescription;
}

const errorsOf = (diagnostics: readonly Diagnostic[]) => diagnostics.filter((d) => d.severity === "error");

/**
 * Builds a snapshot from the files. Pass `template` to use an already-imported
 * one (the server does, for the committed template) instead of compiling.
 */
export function build(files: Files, template?: Template): Snapshot {
  const T = template ?? compileTemplate(files, ENTRY);
  const read = readValuesFile(JSON.parse(files[DATA]), T);
  if (!read.values || errorsOf(read.diagnostics).length) throw new ValuesError(errorsOf(read.diagnostics));
  const issue = read.values;
  const checked = T.check(issue);
  if (!checked.valid) throw new ValuesError(errorsOf(checked.diagnostics));

  const element = T.design(issue as never);
  const { design, report } = toDesign(element);

  // Same template, every value swapped for a token: tells us where every word came from.
  const sentinel = sentinelize(issue);
  const traced = toDesign(T.design(sentinel.data as never));

  return {
    files,
    template: T,
    issue,
    element,
    design: design as unknown as Design,
    report,
    blocks: blocksOf(design as unknown as Design),
    bindings: bindingsOf(traced.design as unknown as Design),
    paths: sentinel.paths,
    review: checked.review,
    description: T.describe(),
  };
}

export type Change =
  | { kind: "copy"; block: string; field: string; path: string; rawPath: Path; before: string; after: string }
  | { kind: "code"; block: string; field: string; file: string; before: string; after: string }
  | { kind: "conflict"; block: string; field: string; before: string; after: string; reason: string }
  | { kind: "added" | "removed" | "moved"; block: string; type: string; label: string }
  | { kind: "locked"; block: string; label: string };

export interface PullResult {
  files: Files;
  changes: Change[];
  /** Changes that landed in source: the builder and the code agree on these again. */
  applied: number;
}

const jsxText = (s: string) => (/[{}<>]/.test(s) ? `{${JSON.stringify(s)}}` : s);

function patchLiteral(source: string, before: string, after: string): string | null {
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + 1) >= 0) return null;
  return source.slice(0, first) + jsxText(after) + source.slice(first + before.length);
}

const isLink = (field: string) => field === "src" || field === "href" || /^link\d|\.href$|^icon\d/.test(field);

export function pull(snapshot: Snapshot, edited: Design): PullResult {
  let issue = snapshot.issue;
  let tsx = snapshot.files[ENTRY];
  const changes: Change[] = [];
  const baseline = new Map(snapshot.blocks.map((b) => [b.id, b]));
  const editedBlocks = blocksOf(edited);
  const editedIds = new Set(editedBlocks.map((b) => b.id));

  for (const block of editedBlocks) {
    const before = baseline.get(block.id);
    if (!before) {
      changes.push({ kind: "added", block: block.id, type: block.type, label: blockLabel(block) });
      continue;
    }
    if (before.type === "html") {
      if (block.fields.html !== before.fields.html) changes.push({ kind: "locked", block: block.id, label: "HTML block" });
      continue;
    }
    if (!EDITABLE.has(block.type)) continue;
    const binding = snapshot.bindings.get(block.id);
    const fields = new Set([...Object.keys(block.fields), ...Object.keys(before.fields)]);

    for (const field of fields) {
      const was = normalizeText(before.fields[field] ?? "");
      const now = normalizeText(block.fields[field] ?? "");
      if (was === now) continue;
      const pattern = binding?.type === block.type ? binding.fields[field] : undefined;
      const tokens = pattern ? tokensIn(pattern) : [];

      if (pattern && tokens.length) {
        const values = matchPattern(normalizeText(pattern), now);
        if (values) {
          values.forEach((value, i) => {
            const path = snapshot.paths[tokens[i]];
            const old = String(getAt(issue, path) ?? "");
            if (old !== value) {
              issue = setAt(issue, path, value);
              changes.push({ kind: "copy", block: block.id, field, path: formatPath(path), rawPath: path, before: old, after: value });
            }
          });
          continue;
        }
        if (tokens.length === 1 && isLink(field)) {
          // A swapped image or link: the whole value becomes the new URL.
          const path = snapshot.paths[tokens[0]];
          const old = String(getAt(issue, path) ?? "");
          issue = setAt(issue, path, now);
          changes.push({ kind: "copy", block: block.id, field, path: formatPath(path), rawPath: path, before: old, after: now });
          continue;
        }
        changes.push({
          kind: "conflict",
          block: block.id,
          field,
          before: was,
          after: now,
          reason: "Part of this text is computed in code. Ask the engineer to change the template.",
        });
        continue;
      }

      // No data in it: the words are written in the JSX itself.
      const patched = field === "text" ? patchLiteral(tsx, was, now) : null;
      if (patched !== null) {
        tsx = patched;
        changes.push({ kind: "code", block: block.id, field, file: ENTRY, before: was, after: now });
      } else {
        changes.push({
          kind: "conflict",
          block: block.id,
          field,
          before: was,
          after: now,
          reason: "This text is spread across markup in the JSX, so it can't be patched safely.",
        });
      }
    }
  }

  for (const block of snapshot.blocks) {
    if (!editedIds.has(block.id)) changes.push({ kind: "removed", block: block.id, type: block.type, label: blockLabel(block) });
  }
  const order = (list: Block[]) => list.map((b) => b.id).filter((id) => editedIds.has(id) && baseline.has(id));
  const was = order(snapshot.blocks).join();
  const now = order(editedBlocks).join();
  if (was !== now) {
    const moved = editedBlocks.find((b, i) => baseline.has(b.id) && order(editedBlocks)[i] !== order(snapshot.blocks)[i]);
    if (moved) changes.push({ kind: "moved", block: moved.id, type: moved.type, label: blockLabel(moved) });
  }

  // The template's guardrails apply to builder edits too: check the values with
  // the edits in, and hold back each edit the template refuses, with its reason.
  let copies = changes.filter((c): c is CopyChange => c.kind === "copy");
  if (copies.length) {
    const refused = refusals(snapshot, copies);
    if (refused.size) {
      for (const [copy, message] of refused) {
        changes[changes.indexOf(copy)] = {
          kind: "conflict",
          block: copy.block,
          field: copy.field,
          before: copy.before,
          after: copy.after,
          reason: `The template refuses it: ${message}.`,
        };
      }
      copies = copies.filter((c) => !refused.has(c));
      issue = copies.reduce((acc, c) => setAt(acc, c.rawPath, c.after), snapshot.issue);
    }
  }

  const files = { ...snapshot.files };
  if (copies.length) {
    // Patch the JSON text in place so the diff is one line per edit.
    let text: string | null = snapshot.files[DATA];
    for (const c of copies) {
      text = text === null ? null : patchJsonValue(text, filePath(c.rawPath), c.after);
    }
    files[DATA] = text ?? `${JSON.stringify({ ...JSON.parse(snapshot.files[DATA]), values: issue }, null, 2)}\n`;
  }
  if (tsx !== snapshot.files[ENTRY]) files[ENTRY] = tsx;
  const applied = changes.filter((c) => c.kind === "copy" || c.kind === "code").length;
  return { files, changes, applied };
}

type CopyChange = Extract<Change, { kind: "copy" }>;

/** Each copy edit the template refuses, with the template's message. */
function refusals(snapshot: Snapshot, copies: CopyChange[]): Map<CopyChange, string> {
  const refused = new Map<CopyChange, string>();
  const valuesWith = (list: CopyChange[]) => list.reduce((acc, c) => setAt(acc, c.rawPath, c.after), snapshot.issue);
  let errors = errorsOf(snapshot.template.check(valuesWith(copies)).diagnostics);
  for (const d of errors) {
    const at = (d.path ?? "").replace(/^values\./, "");
    const copy = copies.find((c) => at === c.path || at.startsWith(`${c.path}.`) || at.startsWith(`${c.path}[`));
    if (copy && !refused.has(copy)) refused.set(copy, d.message);
  }
  // Anything still refused that we couldn't pin on one edit: hold every edit back.
  errors = errorsOf(snapshot.template.check(valuesWith(copies.filter((c) => !refused.has(c)))).diagnostics);
  if (errors.length) for (const c of copies) if (!refused.has(c)) refused.set(c, errors[0].message);
  return refused;
}

/** What fromDesign() alone gives back: the edited design as flat JSX, values baked in. */
export function flatJsx(edited: Design): { code: string; report: string[] } {
  const { code, report } = fromDesign(edited as never, { displayMode: "email" });
  return { code, report };
}

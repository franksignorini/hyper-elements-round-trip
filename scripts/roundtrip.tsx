// The round trip from the shell, no browser needed, for any Hyper Elements template.
//   npm run push [-- my.values.json]                        template -> out/<name>.design.json (load it in any Unlayer editor)
//   npm run pull -- edited.design.json [my.values.json]     an edited design -> patches to the values file and the
//                                                            template's literals, checked by the template, then client checks
// A values file names its template ({ "template": { "module": "./Welcome.tsx" } }), so that's all it needs.
// Without one, it's the Kestrel newsletter in template/.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { render, validate } from "@hyper-elements/react";
import { templateOf } from "@hyper-elements/react/template";
import { emailClients } from "@hyper-elements/email-clients";
import { build, DATA, ENTRY, pull, type Change } from "../src/lib/rt/engine";
import { ownership } from "../src/lib/rt/ownership";
import type { Design } from "../src/lib/rt/design";
import type { Template } from "../src/lib/rt/compile";

const DEFAULT_VALUES = "template/issue.values.json";
const c = {
  blue: (s: string) => `\x1b[38;2;43;69;255m${s}\x1b[0m`,
  orange: (s: string) => `\x1b[38;2;255;90;44m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

interface Project {
  valuesPath: string;
  modulePath: string;
  template: Template;
  /** The engine's view: the template module and its values file, under its two names. */
  files: Record<string, string>;
}

const read = async (file: string) => (await readFile(file, "utf8")).replace(/\r\n/g, "\n");

/** A values file and the template module it names. */
async function open(valuesPath: string): Promise<Project> {
  const valuesText = await read(valuesPath);
  const named = (JSON.parse(valuesText) as { template?: { module?: string } }).template?.module;
  if (!named) throw new Error(`${valuesPath} doesn't name its template: add "template": { "module": "./Your.tsx", … }`);
  const modulePath = path.join(path.dirname(valuesPath), named);
  const imported = (await import(pathToFileURL(path.resolve(modulePath)).href)) as { default?: unknown };
  const template = templateOf(imported.default ?? imported);
  if (!template) throw new Error(`${modulePath} has no default export made with template()`);
  return { valuesPath, modulePath, template, files: { [ENTRY]: await read(modulePath), [DATA]: valuesText } };
}

async function checks(project: Project, files: Record<string, string>) {
  const snap = build(files, project.template);
  const { html } = await render(snap.element);
  const report = validate(snap.element, { plugins: [await emailClients()] });
  const errors = report.diagnostics.filter((d) => d.severity === "error");
  const warnings = report.diagnostics.filter((d) => d.severity === "warning");
  console.log(
    `\n${errors.length ? c.orange("✗") : "✓"} validate() with emailClients(): ${errors.length} errors, ${warnings.length} warnings, ${
      report.diagnostics.length - errors.length - warnings.length
    } notes · ${(html.length / 1024).toFixed(1)} KB HTML`,
  );
  for (const d of errors) console.log(c.orange(`  ${d.code} ${d.message}`));
  return errors.length === 0;
}

function line(project: Project, change: Change) {
  switch (change.kind) {
    case "copy":
      return `${c.orange("●")} ${path.basename(project.valuesPath)} › ${change.path}\n    ${c.dim(`“${change.before}” → “${change.after}”`)}`;
    case "code":
      return `${c.blue("●")} ${path.basename(project.modulePath)} literal\n    ${c.dim(`“${change.before}” → “${change.after}”`)}`;
    case "conflict":
      return `${c.bold("!")} held back: “${change.after}”\n    ${c.dim(change.reason)}`;
    case "locked":
      return `${c.bold("!")} a locked block changed (kept in the builder only)`;
    default:
      return `${c.bold("~")} ${change.kind} ${change.type} block ${c.dim(change.label)}`;
  }
}

const designFor = (valuesPath: string) =>
  valuesPath === DEFAULT_VALUES ? "out/design.json" : `out/${path.basename(valuesPath).replace(/\.values\.json$|\.json$/, "")}.design.json`;

const [command, ...rest] = process.argv.slice(2);

try {
  if (command === "push") {
    const project = await open(rest[0] ?? DEFAULT_VALUES);
    const snap = build(project.files, project.template);
    const out = designFor(project.valuesPath);
    await mkdir("out", { recursive: true });
    await writeFile(out, `${JSON.stringify(snap.design, null, 2)}\n`);
    const owned = ownership(snap);
    console.log(`${c.blue("✓")} ${snap.template.id} ${snap.template.version}: ${project.valuesPath} checked by the template`);
    console.log(`${c.blue("→")} ${out} · ${snap.blocks.length} blocks for the builder`);
    console.log(
      `  ${owned.filter((o) => o.owner === "copy").length} copy · ${owned.filter((o) => o.owner === "code-text").length} code text · ${
        owned.filter((o) => o.owner === "locked").length
      } locked`,
    );
    for (const r of snap.report) console.log(c.dim(`  toDesign(): ${r}`));
    await checks(project, project.files);
  } else if (command === "pull" && rest[0]) {
    const project = await open(rest[1] ?? DEFAULT_VALUES);
    const snap = build(project.files, project.template);
    const edited = JSON.parse(await readFile(rest[0], "utf8")) as Design;
    const result = pull(snap, edited);
    if (!result.changes.length) {
      console.log("No changes: the builder and the code agree.");
    } else {
      console.log(c.bold(`${c.orange("←")} ${result.applied} edit(s) traced back to source\n`));
      for (const change of result.changes) console.log(line(project, change));
    }
    if (result.files[DATA] !== project.files[DATA]) await writeFile(project.valuesPath, result.files[DATA]);
    if (result.files[ENTRY] !== project.files[ENTRY]) await writeFile(project.modulePath, result.files[ENTRY]);
    try {
      const stat = execFileSync("git", ["diff", "--stat", "--", project.valuesPath, project.modulePath], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      console.log(`\n${stat || c.dim("git diff: clean")}`);
    } catch {
      console.log(c.dim("(not a git checkout: skipped git diff)"));
    }
    const ok = await checks(project, result.files);
    process.exitCode = ok ? 0 : 1;
  } else {
    console.log("usage: npm run push [-- my.values.json] | npm run pull -- <edited.design.json> [my.values.json]");
    process.exitCode = 2;
  }
} catch (e) {
  console.error(c.orange(`✗ ${(e as Error).message}`));
  process.exitCode = 1;
}

// The round trip from the shell, no browser needed.
//   npm run push                         template/ -> out/design.json (load it in any Unlayer editor)
//   npm run pull -- edited.design.json   an edited design -> patches to template/, then client checks
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { render, validate } from "@hyper-elements/react";
import { emailClients } from "@hyper-elements/email-clients";
import { build, pull, type Change } from "../src/lib/rt/engine";
import { ownership } from "../src/lib/rt/ownership";
import type { Design } from "../src/lib/rt/design";

const FILES = ["Newsletter.tsx", "theme.ts", "issue.json"];
const ASSET_BASE = process.env.ASSET_BASE ?? "https://hyper-elements-round-trip.vercel.app";
const c = {
  blue: (s: string) => `\x1b[38;2;43;69;255m${s}\x1b[0m`,
  orange: (s: string) => `\x1b[38;2;255;90;44m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

async function readTemplate() {
  const files: Record<string, string> = {};
  for (const f of FILES) files[f] = (await readFile(`template/${f}`, "utf8")).replace(/\r\n/g, "\n");
  return files;
}

async function checks(files: Record<string, string>) {
  const snap = build(files, ASSET_BASE);
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

function line(change: Change) {
  switch (change.kind) {
    case "copy":
      return `${c.orange("●")} issue.json › ${change.path}\n    ${c.dim(`“${change.before}” → “${change.after}”`)}`;
    case "code":
      return `${c.blue("●")} ${change.file} literal\n    ${c.dim(`“${change.before}” → “${change.after}”`)}`;
    case "conflict":
      return `${c.bold("!")} held back: “${change.after}”\n    ${c.dim(change.reason)}`;
    case "locked":
      return `${c.bold("!")} a locked block changed (kept in the builder only)`;
    default:
      return `${c.bold("~")} ${change.kind} ${change.type} block ${c.dim(change.label)}`;
  }
}

const [command, input] = process.argv.slice(2);

if (command === "push") {
  const files = await readTemplate();
  const snap = build(files, ASSET_BASE);
  await mkdir("out", { recursive: true });
  await writeFile("out/design.json", `${JSON.stringify(snap.design, null, 2)}\n`);
  const owned = ownership(snap);
  console.log(`${c.blue("→")} out/design.json · ${snap.blocks.length} blocks for the builder`);
  console.log(
    `  ${owned.filter((o) => o.owner === "copy").length} copy · ${owned.filter((o) => o.owner === "code-text").length} code text · ${
      owned.filter((o) => o.owner === "locked").length
    } locked`,
  );
  for (const r of snap.report) console.log(c.dim(`  toDesign(): ${r}`));
  await checks(files);
} else if (command === "pull" && input) {
  const files = await readTemplate();
  const snap = build(files, ASSET_BASE);
  const edited = JSON.parse(await readFile(input, "utf8")) as Design;
  const result = pull(snap, edited);
  if (!result.changes.length) {
    console.log("No changes: the builder and the code agree.");
  } else {
    console.log(c.bold(`${c.orange("←")} ${result.applied} edit(s) traced back to source\n`));
    for (const change of result.changes) console.log(line(change));
  }
  for (const f of FILES) {
    if (result.files[f] !== files[f]) await writeFile(`template/${f}`, result.files[f]);
  }
  try {
    console.log(`\n${execFileSync("git", ["diff", "--stat", "--", "template"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || c.dim("git diff: clean")}`);
  } catch {
    console.log(c.dim("(not a git checkout: skipped git diff)"));
  }
  const ok = await checks(result.files);
  process.exitCode = ok ? 0 : 1;
} else {
  console.log("usage: npm run push | npm run pull -- <edited.design.json>");
  process.exitCode = 2;
}

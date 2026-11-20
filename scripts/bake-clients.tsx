// Runs the email-client emulator on the committed template at build time, for the
// static site (GitHub Pages has no Node server to run it on request).
//   npm run bake:clients   -> public/clients/report.json and public/clients/<client>.html
// The studio shows these for the committed template, and says so once you edit it.
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { render, validate } from "@hyper-elements/react";
import { emailClients, PREVIEW_CLIENTS, renderInEmailClients, type EmailClient } from "@hyper-elements/email-clients";
import { build, DATA } from "../src/lib/rt/engine";

const OUT = "public/clients";
const t0 = performance.now();
const files: Record<string, string> = {};
for (const f of ["Newsletter.tsx", "theme.ts", DATA]) files[f] = (await readFile(`template/${f}`, "utf8")).replace(/\r\n/g, "\n");

const snap = build(files);
const { html } = await render(snap.element);
const findings: { severity: string; code: string; message: string; clients: string[]; source: "html" | "template" }[] = [];

// The same two passes as /api/clients: the HTML as each client rewrites it, then the template.
const fromHtml = await renderInEmailClients(html, { emailClients: [...PREVIEW_CLIENTS] });
for (const d of fromHtml.diagnostics) findings.push({ severity: d.severity, code: d.code, message: d.message, clients: d.clients ?? [], source: "html" });
const report = validate(snap.element, { plugins: [await emailClients()] });
for (const d of report.diagnostics) {
  const clients = (d as { clients?: EmailClient[] }).clients ?? [];
  findings.push({ severity: d.severity, code: d.code, message: d.message, clients, source: "template" });
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
const previews: string[] = [];
for (const id of PREVIEW_CLIENTS) {
  const { previews: drawn } = await renderInEmailClients(snap.element, { emailClients: [id] });
  if (drawn[0]?.html) {
    await writeFile(`${OUT}/${id}.html`, drawn[0].html);
    previews.push(id);
  }
}
await writeFile(
  `${OUT}/report.json`,
  JSON.stringify({ template: `${snap.template.id} ${snap.template.version}`, bakedAt: new Date().toISOString(), findings, previews }),
);
const errors = findings.filter((f) => f.severity === "error").length;
console.log(`[bake-clients] ${previews.length} client previews, ${findings.length} findings (${errors} errors) in ${Math.round(performance.now() - t0)} ms`);

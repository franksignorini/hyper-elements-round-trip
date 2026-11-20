// After every trip: render the template the engineer ships (in the browser), then
// ask Hyper Elements' email client emulator about it (on the server, /api/clients).
// On the static site there is no server: the emulator ran at build time on the
// committed template (scripts/bake-clients.tsx), and the studio reads that.
import type { ReactElement } from "react";
import { render, validate } from "@hyper-elements/react";
import { TEMPLATE_SOURCES } from "@/generated/sources";

/** True on the static GitHub Pages build, where /api/clients doesn't exist. */
export const STATIC_SITE = process.env.NEXT_PUBLIC_STATIC_SITE === "1";
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** The files are the committed template, the one the build-time check ran on. */
const isCommitted = (files: Record<string, string>) =>
  Object.entries(TEMPLATE_SOURCES).every(([name, text]) => files[name] === text);

export const CLIENTS = [
  { id: "outlook", name: "Outlook", sub: "Windows classic", preview: true },
  { id: "outlook-com", name: "Outlook.com", sub: "webmail", preview: true },
  { id: "outlook-mac", name: "Outlook", sub: "Mac", preview: true },
  { id: "gmail", name: "Gmail", sub: "webmail", preview: true },
  { id: "gmail-app", name: "Gmail", sub: "Android app", preview: true },
  { id: "apple-mail", name: "Apple Mail", sub: "Mac", preview: true },
  { id: "yahoo", name: "Yahoo Mail", sub: "webmail", preview: true },
  { id: "aol", name: "AOL Mail", sub: "webmail", preview: true },
  { id: "gmail-app-other", name: "Gmail app", sub: "other accounts", preview: true },
] as const;
export type ClientId = (typeof CLIENTS)[number]["id"];

export interface ClientResult {
  id: ClientId;
  errors: number;
  warnings: number;
  notes: number;
  messages: string[];
}

export interface CheckResult {
  html: string;
  text: string;
  bytes: number;
  clients: ClientResult[];
  /** Diagnostics from validate() that aren't about one client. */
  general: { severity: string; message: string }[];
  templateChecked: boolean;
  emulator: boolean;
  /**
   * Static site only: the verdicts come from the build-time check of the committed
   * template. "fresh" when that is what's in the editor, "stale" once it's edited.
   */
  baked?: "fresh" | "stale";
  ms: number;
  ctx: CheckContext;
}

interface Finding {
  severity: string;
  code: string;
  message: string;
  clients: string[];
}

export interface CheckContext {
  files: Record<string, string>;
  issue: unknown;
}

export async function runChecks(element: ReactElement, ctx: CheckContext): Promise<CheckResult> {
  const t0 = performance.now();
  const { html, text } = await render(element);
  const local = validate(element);
  const general = local.diagnostics.map((d) => ({ severity: d.severity, message: d.message }));
  const clients: ClientResult[] = CLIENTS.map((c) => ({ id: c.id, errors: 0, warnings: 0, notes: 0, messages: [] }));
  let templateChecked = false;
  let emulator = false;
  let baked: CheckResult["baked"];
  const tally = (findings: Finding[]) => {
    const seen = new Set<string>();
    for (const f of findings) {
      const targets = f.clients.length ? clients.filter((c) => f.clients.includes(c.id)) : clients;
      for (const c of targets) {
        const key = `${c.id}|${f.code}|${f.message}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (f.severity === "error") c.errors++;
        else if (f.severity === "warning") c.warnings++;
        else c.notes++;
        if (c.messages.length < 6) c.messages.push(f.message);
      }
    }
  };
  try {
    if (STATIC_SITE) {
      // No server here: the emulator's verdicts on the committed template, from the build.
      const res = await fetch(`${BASE}/clients/report.json`);
      if (res.ok) {
        const data = (await res.json()) as { findings: Finding[] };
        tally(data.findings);
        emulator = true;
        templateChecked = true;
        baked = isCommitted(ctx.files) ? "fresh" : "stale";
      }
    } else {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          html,
          issue: ctx.issue,
          template: ctx.files["Newsletter.tsx"],
          theme: ctx.files["theme.ts"],
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { findings: Finding[]; templateChecked: boolean };
        emulator = true;
        templateChecked = data.templateChecked;
        tally(data.findings);
      }
    }
  } catch {
    // Offline: the in-browser validate() result still shows.
  }
  for (const d of local.diagnostics) if (d.severity === "error") for (const c of clients) c.errors++;
  return {
    html,
    text,
    bytes: new Blob([html]).size,
    clients,
    general,
    templateChecked,
    emulator,
    baked,
    ms: Math.round(performance.now() - t0),
    ctx,
  };
}

/** The client's preview HTML. Throws with a readable reason when there is none. */
export async function previewIn(html: string, client: ClientId, ctx: CheckContext): Promise<string> {
  if (STATIC_SITE) {
    // The committed template, drawn by the emulator when the site was built.
    const res = await fetch(`${BASE}/clients/${client}.html`).catch(() => null);
    if (!res?.ok) throw new Error("This client's preview wasn't built with the site. Run the studio locally (npm run dev) to draw it.");
    return res.text();
  }
  let res: Response;
  try {
    res = await fetch("/api/clients", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      html,
      preview: client,
      issue: ctx.issue,
      template: ctx.files["Newsletter.tsx"],
      theme: ctx.files["theme.ts"],
    }),
    });
  } catch {
    throw new Error("Couldn't reach the emulator. Is the server still running?");
  }
  const data = (await res.json().catch(() => ({}))) as { html?: string | null; error?: string };
  if (!res.ok) throw new Error(data.error ?? `The emulator answered ${res.status}.`);
  if (!data.html) throw new Error("The emulator returned no preview for this client.");
  return data.html;
}

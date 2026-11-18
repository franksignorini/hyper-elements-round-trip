// The email client emulator runs on Node (it reads its measured fonts from disk).
// POST { html, issue?, template? }  -> per-client diagnostics
// POST { html, preview: "gmail" }   -> that client's preview HTML
// The server never runs code it is sent: `issue` is data, and template checks
// run on the committed Newsletter.tsx only when the browser's JSX matches it.
import { createElement } from "react";
import { validate } from "@hyper-elements/react";
import { emailClients, PREVIEW_CLIENTS, renderInEmailClients, type EmailClient } from "@hyper-elements/email-clients";
import Newsletter from "@template/Newsletter";
import { TEMPLATE_SOURCES } from "@/generated/sources";

export const runtime = "nodejs";

interface Body {
  html?: string;
  issue?: unknown;
  template?: string;
  theme?: string;
  assetBase?: string;
  preview?: string;
}

interface Finding {
  severity: string;
  code: string;
  message: string;
  clients: string[];
  source: "html" | "template";
}

let plugin: ReturnType<typeof emailClients> | null = null;

export async function POST(request: Request) {
  const body = (await request.json()) as Body;
  if (typeof body.html !== "string" || !body.html.includes("<html") || body.html.length > 400_000) {
    return Response.json({ error: "Send the email's complete HTML (under 400 KB)." }, { status: 400 });
  }

  // The element gives the emulator its exact model. We can build it safely only
  // from the committed code, so only when the browser's code is that code.
  const sameCode = body.template === TEMPLATE_SOURCES["Newsletter.tsx"] && body.theme === TEMPLATE_SOURCES["theme.ts"];
  const element =
    sameCode && body.issue && typeof body.issue === "object"
      ? createElement(Newsletter, {
          issue: body.issue as never,
          assetBase: typeof body.assetBase === "string" ? body.assetBase : undefined,
        })
      : null;

  if (body.preview) {
    if (!(PREVIEW_CLIENTS as readonly string[]).includes(body.preview)) {
      return Response.json({ error: "No preview model for that client." }, { status: 400 });
    }
    const client = [body.preview as never];
    const result = element
      ? await renderInEmailClients(element, { emailClients: client }).catch(() => null)
      : null;
    const { previews } = result ?? (await renderInEmailClients(body.html, { emailClients: client }));
    return Response.json({ html: previews[0]?.html ?? null, id: previews[0]?.id ?? null, exact: Boolean(result) });
  }

  const t0 = performance.now();
  const findings: Finding[] = [];
  const fromHtml = await renderInEmailClients(body.html, { emailClients: [...PREVIEW_CLIENTS] });
  for (const d of fromHtml.diagnostics) {
    findings.push({ severity: d.severity, code: d.code, message: d.message, clients: d.clients ?? [], source: "html" });
  }

  let templateChecked = false;
  if (element) {
    try {
      plugin ??= emailClients();
      const report = validate(element, { plugins: [await plugin] });
      for (const d of report.diagnostics) {
        const clients = (d as { clients?: EmailClient[] }).clients ?? [];
        findings.push({ severity: d.severity, code: d.code, message: d.message, clients, source: "template" });
      }
      templateChecked = true;
    } catch {
      // A data shape the template can't take: the HTML checks above still stand.
    }
  }

  return Response.json({
    findings,
    templateChecked,
    previews: fromHtml.previews.map((p) => p.id),
    ms: Math.round(performance.now() - t0),
  });
}

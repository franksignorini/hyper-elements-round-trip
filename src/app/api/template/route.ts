// Dev only: lets the studio read and write template/ on disk, so builder edits
// become a real `git diff` and saves from your own editor reach the builder.
// In production this route answers 404 and never touches the file system.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const FILES = ["Newsletter.tsx", "theme.ts", "issue.values.json"] as const;
const DIR = path.join(process.cwd(), "template");
const enabled = process.env.NODE_ENV === "development";

async function readAll() {
  const files: Record<string, string> = {};
  for (const f of FILES) files[f] = (await readFile(path.join(DIR, f), "utf8")).replace(/\r\n/g, "\n");
  return files;
}

export async function GET() {
  if (!enabled) return new Response("Not found", { status: 404 });
  return Response.json({ files: await readAll() });
}

export async function PUT(request: Request) {
  if (!enabled) return new Response("Not found", { status: 404 });
  const body = (await request.json()) as Record<string, unknown>;
  const current = await readAll();
  const written: string[] = [];
  for (const f of FILES) {
    const next = body[f];
    if (typeof next === "string" && next !== current[f]) {
      await writeFile(path.join(DIR, f), next, "utf8");
      written.push(f);
    }
  }
  return Response.json({ written });
}

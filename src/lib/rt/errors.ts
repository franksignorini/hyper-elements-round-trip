// Turns a failed build into something an editor can point at: which file, which
// line, and a sentence a person can act on.
import { parsePath } from "./bind";
import { jsonValueLine } from "./jsonText";

export interface BuildError {
  message: string;
  file?: string;
  line?: number;
  /** Every line worth highlighting, when the cause may sit just before the failure. */
  lines?: number[];
}

/** Offset of the first JSON syntax error in `text`, or -1 if it parses. */
export function jsonErrorOffset(text: string): number {
  let i = 0;
  const ws = () => {
    while (i < text.length && " \t\n\r".includes(text[i])) i++;
  };
  const fail = () => {
    throw i;
  };
  const string = () => {
    if (text[i] !== '"') fail();
    i++;
    while (i < text.length && text[i] !== '"') {
      if (text[i] === "\n") fail();
      if (text[i] === "\\") i++;
      i++;
    }
    if (text[i] !== '"') fail();
    i++;
  };
  const value = (): void => {
    ws();
    const c = text[i];
    if (c === "{") {
      i++;
      ws();
      if (text[i] === "}") return void i++;
      for (;;) {
        ws();
        string();
        ws();
        if (text[i] !== ":") fail();
        i++;
        value();
        ws();
        if (text[i] === ",") {
          i++;
          continue;
        }
        if (text[i] === "}") return void i++;
        fail();
      }
    }
    if (c === "[") {
      i++;
      ws();
      if (text[i] === "]") return void i++;
      for (;;) {
        value();
        ws();
        if (text[i] === ",") {
          i++;
          continue;
        }
        if (text[i] === "]") return void i++;
        fail();
      }
    }
    if (c === '"') return string();
    const literal = /^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/.exec(text.slice(i));
    if (!literal) fail();
    i += literal![0].length;
  };
  try {
    value();
    ws();
    if (i < text.length) fail();
    return -1;
  } catch (at) {
    return typeof at === "number" ? Math.min(at, text.length) : -1;
  }
}

const lineAt = (text: string, offset: number) => text.slice(0, offset).split("\n").length;

const DATA = "issue.values.json";

/** Where a build error points, in the template's files. */
export function locateError(files: Record<string, string>, raw: string): BuildError {
  // issue.values.json that doesn't parse. First: the template imports the file, so its
  // syntax error also arrives as "issue.values.json: …" and must not read as a refusal.
  if (/JSON/.test(raw) && files[DATA] !== undefined) {
    const at = jsonErrorOffset(files[DATA]);
    if (at >= 0) {
      const text = files[DATA];
      const failed = lineAt(text, at);
      // A missing comma fails on the next line's first token: the fix belongs on the line before.
      const before = lineAt(text, text.slice(0, at).trimEnd().length);
      const line = Math.min(before, failed);
      const lines = before < failed ? [before, failed] : [failed];
      return {
        file: DATA,
        line,
        lines,
        message: `${DATA} isn't valid JSON ${lines.length > 1 ? `between lines ${before} and ${failed}` : `at line ${line}`}. Check for a missing quote or comma.`,
      };
    }
  }
  // A value the template refuses: "issue.values.json: Headline: is longer… (at values.hero.title)".
  const refused = /^issue\.values\.json: ([\s\S]+?)(?: \(at ([^)]+)\))?$/.exec(raw);
  if (refused && files[DATA] !== undefined) {
    const [, reason, at] = refused;
    const line = at ? jsonValueLine(files[DATA], parsePath(at)) : null;
    return {
      file: DATA,
      line: line ?? undefined,
      message: `The template refuses ${DATA}${line ? ` at line ${line}` : ""}: ${reason}.`,
    };
  }
  // Sucrase: "Newsletter.tsx: Error transforming Newsletter.tsx: Unexpected token (61:70)".
  const transform = /^([\w.]+\.tsx?):[\s\S]*?:\s*([\s\S]+?)\s*\((\d+):(\d+)\)\s*$/.exec(raw);
  if (transform) {
    const [, file, reason, line] = transform;
    return { file, line: Number(line), message: `${file} doesn't compile at line ${line}: ${reason}` };
  }
  // The template ran and threw.
  return {
    message: `The template threw while rendering: ${raw}. If you just edited ${DATA}, a field may be missing or renamed.`,
  };
}

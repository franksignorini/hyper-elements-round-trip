// Compiles the template's virtual files (the editor's buffers) into a live
// Hyper Elements template, entirely in the browser. Sucrase strips TypeScript and
// JSX; a tiny require() resolves the imports a template may use.
import { transform } from "sucrase";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import * as Elements from "@hyper-elements/react";
import * as Templates from "@hyper-elements/react/template";
import { templateOf, type Template as TemplateOf } from "@hyper-elements/react/template";

export type Files = Record<string, string>;
/** Any template, whatever its fields: the engine reads them through describe() and check(). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Template = TemplateOf<any, any>;

export class CompileError extends Error {
  constructor(
    message: string,
    readonly file: string,
  ) {
    super(message);
  }
}

const externals: Record<string, unknown> = {
  react: React,
  "react/jsx-runtime": jsxRuntime,
  "react/jsx-dev-runtime": jsxRuntime,
  "@hyper-elements/react": Elements,
  "@hyper-elements/react/template": Templates,
};

function normalize(spec: string, files: Files): string | null {
  const bare = spec.replace(/^\.\//, "");
  for (const candidate of [bare, `${bare}.ts`, `${bare}.tsx`, `${bare}.json`]) {
    if (candidate in files) return candidate;
  }
  return null;
}

export function compileTemplate(files: Files, entry = "Newsletter.tsx", overrides: Files = {}): Template {
  const all = { ...files, ...overrides };
  const cache = new Map<string, { exports: Record<string, unknown> }>();

  const load = (file: string): Record<string, unknown> => {
    const hit = cache.get(file);
    if (hit) return hit.exports;
    const record = { exports: {} as Record<string, unknown> };
    cache.set(file, record);
    const source = all[file];
    if (file.endsWith(".json")) {
      try {
        record.exports = JSON.parse(source);
      } catch (e) {
        throw new CompileError(`${file}: ${(e as Error).message}`, file);
      }
      return record.exports;
    }
    let code: string;
    try {
      code = transform(source, {
        transforms: ["typescript", "jsx", "imports"],
        jsxRuntime: "automatic",
        production: true,
        filePath: file,
      }).code;
    } catch (e) {
      throw new CompileError(`${file}: ${(e as Error).message}`, file);
    }
    const require = (spec: string) => {
      if (spec in externals) return externals[spec];
      const target = normalize(spec, all);
      if (!target) throw new CompileError(`${file}: cannot find module "${spec}"`, file);
      return load(target);
    };
    try {
      new Function("require", "module", "exports", code)(require, record, record.exports);
    } catch (e) {
      if (e instanceof CompileError) throw e;
      throw new CompileError(`${file}: ${(e as Error).message}`, file);
    }
    return record.exports;
  };

  const mod = load(entry);
  const found = templateOf(mod.default ?? mod);
  if (!found) throw new CompileError(`${entry} has no default export made with template()`, entry);
  return found;
}

// Compiles the template's virtual files (the editor's buffers) into a live React
// component, entirely in the browser. Sucrase strips TypeScript and JSX; a tiny
// require() resolves the three imports a template may use.
import { transform } from "sucrase";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import * as Elements from "@hyper-elements/react";

export type Files = Record<string, string>;
export type TemplateComponent = React.ComponentType<{ issue?: unknown; assetBase?: string }>;

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
};

function normalize(spec: string, files: Files): string | null {
  const bare = spec.replace(/^\.\//, "");
  for (const candidate of [bare, `${bare}.ts`, `${bare}.tsx`, `${bare}.json`]) {
    if (candidate in files) return candidate;
  }
  return null;
}

export function compileTemplate(files: Files, entry = "Newsletter.tsx", overrides: Files = {}): TemplateComponent {
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
  const component = (mod.default ?? mod) as TemplateComponent;
  if (typeof component !== "function") throw new CompileError(`${entry} has no default export component`, entry);
  return component;
}

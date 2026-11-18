// Replaces one string value inside JSON source text, leaving every other byte
// (indentation, key order, compact objects) alone, so a builder edit is a
// one-line diff instead of a reformatted file.
import type { Path } from "./bind";

class Scanner {
  i = 0;
  constructor(readonly s: string) {}
  ws() {
    while (/\s/.test(this.s[this.i] ?? "")) this.i++;
  }
  string(): [number, number] {
    const start = this.i;
    this.i++; // opening quote
    while (this.i < this.s.length && this.s[this.i] !== '"') this.i += this.s[this.i] === "\\" ? 2 : 1;
    this.i++; // closing quote
    return [start, this.i];
  }
  /** Skips one value; returns its [start, end) range. */
  value(): [number, number] {
    this.ws();
    const start = this.i;
    const c = this.s[this.i];
    if (c === '"') return this.string();
    if (c === "{" || c === "[") {
      const close = c === "{" ? "}" : "]";
      this.i++;
      this.ws();
      while (this.s[this.i] !== close) {
        if (c === "{") {
          this.string();
          this.ws();
          this.i++; // colon
        }
        this.value();
        this.ws();
        if (this.s[this.i] === ",") this.i++;
        this.ws();
      }
      this.i++;
      return [start, this.i];
    }
    while (this.i < this.s.length && !/[\s,}\]]/.test(this.s[this.i])) this.i++;
    return [start, this.i];
  }
  /** Finds the range of the value at path. */
  find(path: Path): [number, number] | null {
    this.ws();
    if (!path.length) return this.value();
    const [head, ...rest] = path;
    const c = this.s[this.i];
    if (c !== "{" && c !== "[") return null;
    const close = c === "{" ? "}" : "]";
    this.i++;
    this.ws();
    let index = 0;
    while (this.i < this.s.length && this.s[this.i] !== close) {
      let key: string | number = index;
      if (c === "{") {
        const [a, b] = this.string();
        key = JSON.parse(this.s.slice(a, b)) as string;
        this.ws();
        this.i++; // colon
      }
      this.ws();
      if (key === head) return this.find(rest);
      this.value();
      this.ws();
      if (this.s[this.i] === ",") this.i++;
      this.ws();
      index++;
    }
    return null;
  }
}

/** The 1-based line a value sits on, for jumping to it in an editor. */
export function jsonValueLine(source: string, path: Path): number | null {
  try {
    const range = new Scanner(source).find(path);
    return range ? source.slice(0, range[0]).split("\n").length : null;
  } catch {
    return null;
  }
}

export function patchJsonValue(source: string, path: Path, value: string): string | null {
  try {
    const range = new Scanner(source).find(path);
    if (!range) return null;
    const next = source.slice(0, range[0]) + JSON.stringify(value) + source.slice(range[1]);
    JSON.parse(next);
    return next;
  } catch {
    return null;
  }
}

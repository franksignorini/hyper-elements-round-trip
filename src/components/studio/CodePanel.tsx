"use client";

import { useEffect, useMemo, useRef } from "react";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import { StateEffect, StateField } from "@codemirror/state";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { motion } from "motion/react";
import type { BuildError } from "@/lib/rt/errors";
import styles from "./studio.module.css";

export interface Flash {
  file: string;
  lines: number[];
  key: number;
}

const setFlash = StateEffect.define<number[]>();
const flashField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setFlash)) {
        const marks = e.value
          .filter((n) => n >= 1 && n <= tr.state.doc.lines)
          .map((n) => Decoration.line({ class: "cm-rt-flash" }).range(tr.state.doc.line(n).from));
        deco = Decoration.set(marks, true);
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const riso = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword], color: "#8fa0ff" },
  { tag: [t.string, t.special(t.string)], color: "#ffb59c" },
  { tag: [t.number, t.bool, t.null], color: "#ffd166" },
  { tag: [t.tagName, t.typeName, t.className], color: "#7cf0c2" },
  { tag: [t.attributeName, t.propertyName], color: "#c8c2b4" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "#8a8272", fontStyle: "italic" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "#f4efe4" },
  { tag: [t.operator, t.punctuation, t.bracket, t.angleBracket], color: "#9a927f" },
]);

const theme = EditorView.theme(
  {
    "&": { backgroundColor: "transparent", color: "#efe9dd", height: "100%", fontSize: "12.5px" },
    ".cm-content": { fontFamily: "var(--font-mono), monospace", caretColor: "#ff5a2c", padding: "12px 0 80px" },
    ".cm-gutters": { backgroundColor: "transparent", color: "#5d574b", border: "none" },
    ".cm-activeLine": { backgroundColor: "rgba(255,255,255,0.035)" },
    ".cm-activeLineGutter": { backgroundColor: "transparent", color: "#c8c2b4" },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": { backgroundColor: "rgba(43,69,255,0.45) !important" },
    ".cm-cursor": { borderLeftColor: "#ff5a2c", borderLeftWidth: "2px" },
    ".cm-scroller": { lineHeight: "1.65" },
  },
  { dark: true },
);

interface Props {
  files: Record<string, string>;
  active: string;
  owners: Record<string, "engineer" | "marketer" | "shared">;
  onActive(file: string): void;
  onChange(file: string, text: string): void;
  flash: Flash | null;
  error: BuildError | null;
  onJump(file: string, lines: number[]): void;
  dirty: Record<string, boolean>;
}

export function CodePanel({ files, active, owners, onActive, onChange, flash, error, onJump, dirty }: Props) {
  const cm = useRef<ReactCodeMirrorRef>(null);
  const extensions = useMemo(
    () => [
      active.endsWith(".json") ? json() : javascript({ jsx: true, typescript: true }),
      syntaxHighlighting(riso),
      theme,
      flashField,
      EditorView.lineWrapping,
    ],
    [active],
  );

  useEffect(() => {
    if (!flash || flash.file !== active) return;
    const view = cm.current?.view;
    if (!view) return;
    const id = requestAnimationFrame(() => {
      view.dispatch({ effects: setFlash.of(flash.lines) });
      const first = flash.lines[0];
      if (first && first <= view.state.doc.lines) {
        view.dispatch({ effects: EditorView.scrollIntoView(view.state.doc.line(first).from, { y: "center" }) });
      }
    });
    return () => cancelAnimationFrame(id);
  }, [flash, active]);

  return (
    <section className={styles.code} aria-label="Template source">
      <header className={styles.panelHead}>
        <span className={styles.role} data-role="engineer">
          <i /> Engineer
        </span>
        <span className={styles.panelTitle}>template/</span>
      </header>
      <nav className={styles.tabs} role="tablist">
        {Object.keys(files).map((file) => (
          <button
            key={file}
            role="tab"
            aria-selected={file === active}
            className={styles.tab}
            data-owner={owners[file]}
            onClick={() => onActive(file)}
          >
            {file === active && <motion.span layoutId="code-tab" className={styles.tabInk} />}
            <span className={styles.tabLabel}>{file}</span>
            {dirty[file] && <span className={styles.dirty} title="Changed since the session started" />}
          </button>
        ))}
      </nav>
      <div className={styles.editor}>
        <CodeMirror
          ref={cm}
          value={files[active]}
          height="100%"
          theme="none"
          basicSetup={{ foldGutter: false, highlightActiveLine: true, autocompletion: false }}
          extensions={extensions}
          onChange={(text) => onChange(active, text)}
        />
      </div>
      {error && (
        <motion.div className={styles.compileError} initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
          <strong>Not sent to the builder</strong>
          <span>{error.message}</span>
          {error.file && error.line && (
            <button className={styles.errorJump} onClick={() => onJump(error.file!, error.lines ?? [error.line!])}>
              Go to {error.file}:{error.line}
            </button>
          )}
        </motion.div>
      )}
    </section>
  );
}

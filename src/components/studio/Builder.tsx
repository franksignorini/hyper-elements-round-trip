"use client";

// Unlayer's builder, embedded with no projectId: loadDesign() in, design:updated out.
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { Design } from "@/lib/rt/design";

interface UnlayerEditor {
  loadDesign(design: unknown): void;
  saveDesign(cb: (design: unknown) => void): void;
  exportHtml(cb: (data: { design: unknown; html: string }) => void): void;
  addEventListener(event: string, cb: (data: unknown) => void): void;
  destroy?: () => void;
}
declare global {
  interface Window {
    unlayer?: { createEditor(options: Record<string, unknown>): UnlayerEditor };
  }
}

export interface BuilderHandle {
  load(design: Design): void;
  save(): Promise<Design>;
  exportHtml(): Promise<string>;
}

const SCRIPT = "https://editor.unlayer.com/embed.js";
let scriptPromise: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (typeof window !== "undefined" && window.unlayer) return Promise.resolve();
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error("Could not load the Unlayer builder (offline?)"));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

interface Props {
  onReady(): void;
  onEdit(design: Design): void;
  onError(message: string): void;
}

export const Builder = forwardRef<BuilderHandle, Props>(function Builder({ onReady, onEdit, onError }, ref) {
  const editorRef = useRef<UnlayerEditor | null>(null);
  const quietUntil = useRef(0);
  const loaded = useRef(false);
  const handlers = useRef({ onReady, onEdit, onError });
  useEffect(() => {
    handlers.current = { onReady, onEdit, onError };
  });

  useImperativeHandle(ref, () => ({
    load(design) {
      // A load fires its own update events: those aren't a person's edits.
      quietUntil.current = Date.now() + 1200;
      editorRef.current?.loadDesign(structuredClone(design));
    },
    save() {
      return new Promise((resolve) => editorRef.current?.saveDesign((d) => resolve(d as Design)));
    },
    exportHtml() {
      return new Promise((resolve) => editorRef.current?.exportHtml((d) => resolve(d.html)));
    },
  }));

  useEffect(() => {
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || editorRef.current || !window.unlayer) return;
        const editor = window.unlayer.createEditor({
          id: "rt-builder",
          displayMode: "email",
          appearance: { theme: "modern_light", panels: { tools: { dock: "right" } } },
          features: { preview: true, undoRedo: true },
          // No projectId: the free embed is enough to round-trip a design locally.
        });
        editorRef.current = editor;
        if (process.env.NODE_ENV === "development") (window as unknown as { __rtEditor: unknown }).__rtEditor = editor;
        editor.addEventListener("editor:ready", () => handlers.current.onReady());
        editor.addEventListener("design:loaded", () => {
          loaded.current = true;
          quietUntil.current = Date.now() + 600;
        });
        editor.addEventListener("design:updated", () => {
          // Before our first design lands, the empty editor's updates aren't edits.
          if (!loaded.current || Date.now() < quietUntil.current) return;
          editor.saveDesign((d) => handlers.current.onEdit(d as Design));
        });
      })
      .catch((e: Error) => handlers.current.onError(e.message));
    return () => {
      cancelled = true;
    };
  }, []);

  return <div id="rt-builder" style={{ width: "100%", height: "100%" }} />;
});

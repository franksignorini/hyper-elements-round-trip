"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { diffLines } from "diff";
import { TEMPLATE_SOURCES } from "@/generated/sources";
import { build, DATA, ENTRY, filePath, flatJsx, pull, type Change, type Snapshot } from "@/lib/rt/engine";
import { CompileError } from "@/lib/rt/compile";
import type { Design } from "@/lib/rt/design";
import { blockLabel } from "@/lib/rt/design";
import { runChecks, type CheckResult } from "@/lib/rt/checks";
import { ownership, OWNER_INFO, type Owned, type Owner } from "@/lib/rt/ownership";
import { Builder, type BuilderHandle } from "./Builder";
import { CodePanel, type Flash } from "./CodePanel";
import { DiffView } from "./DiffView";
import { ClientStamps } from "./ClientStamps";
import { ReviewModal } from "./ReviewModal";
import { Intro, Tour, tourFocus, type Focus, type TourState } from "./Guide";
import { PhoneStudio } from "./PhoneStudio";
import { jsonValueLine, patchJsonValue } from "@/lib/rt/jsonText";
import { locateError, type BuildError } from "@/lib/rt/errors";
import styles from "./studio.module.css";

type Who = "engineer" | "marketer";
interface ReceiptLine {
  tone: "copy" | "code" | "conflict" | "structure" | "info";
  text: string;
  detail?: string;
}
interface Receipt {
  id: number;
  who: Who;
  title: string;
  ms: number;
  time: string;
  lines: ReceiptLine[];
}
interface Director {
  step: number;
  focus: "builder" | "code" | "dock" | null;
  caption: string;
}
interface Flight {
  id: number;
  dir: "right" | "left";
  label: string;
  /** Light the wire only: a word flight is telling this trip. */
  quiet?: boolean;
}
interface Point {
  x: number;
  y: number;
}
/** The edited word itself, flying from where it was typed to where it landed. */
interface WordFlight {
  id: number;
  dir: "right" | "left";
  word: string;
  caption: string;
  from: Point;
  to: Point;
}

/** The words that changed between two texts: "build" for "…that build them" → "…that draw them". */
function changedWords(before: string, after: string): string | null {
  const a = before.split(/\s+/);
  const b = after.split(/\s+/);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let end = 0;
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
  const words = b.slice(start, b.length - end).join(" ").trim();
  if (!words) return null;
  return words.length > 34 ? `${words.slice(0, 32)}…` : words;
}

// The template as it was when this page opened. Kept on globalThis so that, with
// "Sync with disk" on, our own writes (re-embedded by the dev watcher) don't move it.
const HEAD: Record<string, string> = ((globalThis as { __rtHead?: Record<string, string> }).__rtHead ??= {
  ...TEMPLATE_SOURCES,
});
const OWNERS = { "Newsletter.tsx": "engineer", "theme.ts": "engineer", "issue.values.json": "shared" } as const;
type DockTab = "receipts" | "diff" | "ownership" | "clients" | "flat";

const DEMO_STEPS = 10;

// Two editors side by side need a wide screen: a phone gets PhoneStudio instead.
const PHONE = "(max-width: 760px)";
const subscribePhone = (onChange: () => void) => {
  const query = window.matchMedia(PHONE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const phoneNow = () => window.matchMedia(PHONE).matches;

/** "The template refuses it: Headline: is longer than 48 characters." → the stamp's two lines. */
function stampFor(reason: string, wrote: string): { rule: string; wrote: string } {
  const message = reason.replace(/^The template refuses it:\s*/, "").replace(/\.$/, "");
  const limit = /^(.+?): is longer than (\d+) characters$/.exec(message);
  if (limit) return { rule: `${limit[1]} · max ${limit[2]}`, wrote: `you wrote ${wrote.length}` };
  return { rule: message, wrote: "" };
}

// The intro shows once per browser; storage can be blocked, so never let it throw.
const GUIDE_KEY = "rt.guide.seen";
const guideSeen = () => {
  try {
    return window.localStorage.getItem(GUIDE_KEY) === "1";
  } catch {
    return false;
  }
};
const markGuideSeen = () => {
  try {
    window.localStorage.setItem(GUIDE_KEY, "1");
  } catch {
    // private window: the intro shows again next time, which is fine
  }
};

const now = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function changedLines(before: string, after: string): number[] {
  const lines: number[] = [];
  let n = 1;
  for (const part of diffLines(before, after)) {
    const count = part.count ?? part.value.split("\n").length - 1;
    if (part.added) for (let i = 0; i < count; i++) lines.push(n + i);
    if (!part.removed) n += count;
  }
  return lines;
}

function describe(change: Change): ReceiptLine {
  switch (change.kind) {
    case "copy":
      return { tone: "copy", text: `${DATA} › ${change.path}`, detail: `“${change.before}” → “${change.after}”` };
    case "code":
      return { tone: "code", text: `${change.file} › literal text`, detail: `“${change.before}” → “${change.after}”` };
    case "conflict":
      return { tone: "conflict", text: `Held back: “${change.after}”`, detail: change.reason };
    case "locked":
      return { tone: "conflict", text: "A locked block changed", detail: "It's code-owned markup, so the edit stays in the builder." };
    default:
      return {
        tone: "structure",
        text: `${change.kind === "added" ? "New" : change.kind === "removed" ? "Removed" : "Moved"} ${change.type} block${change.label ? `: “${change.label}”` : ""}`,
        detail: "Layout changes stay in the builder design; the fromDesign() tab shows them as JSX.",
      };
  }
}

export default function Studio() {
  const [files, setFiles] = useState<Record<string, string>>(HEAD);
  // Open on the copy, where edits land, not on the imports.
  const [active, setActive] = useState<string>(DATA);
  // The first build happens here, before the first paint (this component never renders on the server).
  const [initial] = useState(() => {
    try {
      return { snap: build(HEAD), error: null };
    } catch (e) {
      return { snap: null, error: locateError(HEAD, (e as Error).message) };
    }
  });
  const [snapshot, setSnapshot] = useState<Snapshot | null>(initial.snap);
  const [compileError, setCompileError] = useState<BuildError | null>(initial.error);
  const [builderReady, setBuilderReady] = useState(false);
  const [builderError, setBuilderError] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [words, setWords] = useState<WordFlight[]>([]);
  const stageRef = useRef<HTMLElement>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [checks, setChecks] = useState<CheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkKey, setCheckKey] = useState(0);
  const [held, setHeld] = useState<Change[]>([]);
  const [edited, setEdited] = useState<Design | null>(null);
  const [tab, setTab] = useState<DockTab>("receipts");
  const [dockOpen, setDockOpen] = useState(true);
  const [trips, setTrips] = useState({ push: 0, pull: 0 });
  const [introOpen, setIntroOpen] = useState(() => !guideSeen());
  const [guideFocus, setGuideFocus] = useState<Focus>(null);
  const [tour, setTour] = useState<TourState | null>(null);
  const [stamp, setStamp] = useState<{ id: number; rule: string; wrote: string } | null>(null);
  const [disk, setDisk] = useState<{ enabled: boolean; on: boolean }>({ enabled: false, on: false });
  // "main": what the change request diffs against. Moves forward on merge.
  const [head, setHead] = useState<Record<string, string>>(HEAD);
  const [authors, setAuthors] = useState<Who[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [director, setDirector] = useState<Director | null>(null);
  const stopDemo = useRef(false);
  const onBuilderEditRef = useRef<(d: Design) => void>(() => {});

  const builder = useRef<BuilderHandle>(null);
  const snapRef = useRef<Snapshot | null>(initial.snap);
  const filesRef = useRef(files);
  const ids = useRef(0);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const diskSeen = useRef<Record<string, string> | null>(null);
  const heldKey = useRef("[]");

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  const addReceipt = useCallback((r: Omit<Receipt, "id" | "time">) => {
    setReceipts((list) => [{ ...r, id: ++ids.current, time: now() }, ...list].slice(0, 40));
  }, []);

  const fly = useCallback((dir: Flight["dir"], label: string, quiet = false) => {
    const id = ++ids.current;
    setFlights((f) => [...f, { id, dir, label, quiet }]);
    setTimeout(() => setFlights((f) => f.filter((x) => x.id !== id)), 1500);
  }, []);

  /**
   * Flies a word between the builder and a line of the code panel. Measured a frame
   * later, once the code panel has scrolled that line into view.
   */
  const flyWord = useCallback((dir: WordFlight["dir"], word: string, caption: string, line?: number) => {
    setTimeout(() => {
      const stage = stageRef.current;
      if (!stage) return;
      const s = stage.getBoundingClientRect();
      const frame = stage.querySelector(`.${styles.builderFrame}`)?.getBoundingClientRect();
      const builderPt = frame
        ? { x: frame.left - s.left + frame.width * 0.36, y: frame.top - s.top + frame.height * 0.42 }
        : { x: s.width * 0.7, y: s.height * 0.45 };
      const gutter =
        line === undefined
          ? undefined
          : [...stage.querySelectorAll(".cm-gutterElement")].find((g) => g.textContent?.trim() === String(line));
      const editor = stage.querySelector(".cm-editor")?.getBoundingClientRect();
      const r = gutter?.getBoundingClientRect();
      const codePt = r
        ? { x: r.right - s.left + 120, y: r.top - s.top + r.height / 2 }
        : editor
          ? { x: editor.left - s.left + editor.width / 2, y: editor.top - s.top + editor.height / 2 }
          : { x: s.width * 0.15, y: s.height * 0.45 };
      const [from, to] = dir === "left" ? [builderPt, codePt] : [codePt, builderPt];
      const id = ++ids.current;
      setWords((w) => [...w, { id, dir, word, caption, from, to }]);
      setTimeout(() => setWords((w) => w.filter((x) => x.id !== id)), 1900);
    }, 90);
  }, []);

  const check = useCallback(async (snap: Snapshot) => {
    setChecking(true);
    try {
      const result = await runChecks(snap.element, { files: snap.files, issue: snap.issue });
      setChecks(result);
      setCheckKey((k) => k + 1);
    } finally {
      setChecking(false);
    }
  }, []);

  const writeDisk = useCallback(
    async (next: Record<string, string>) => {
      if (!disk.on) return;
      diskSeen.current = next;
      await fetch("/api/template", { method: "PUT", body: JSON.stringify(next) }).catch(() => undefined);
    },
    [disk.on],
  );

  /** Code -> builder. */
  const push = useCallback(
    (next: Record<string, string>, who: Who = "engineer", note?: string) => {
      const t0 = performance.now();
      let snap: Snapshot;
      try {
        snap = build(next);
      } catch (e) {
        setCompileError(locateError(next, e instanceof CompileError ? e.message : (e as Error).message));
        return;
      }
      setCompileError(null);
      const before = snapRef.current;
      snapRef.current = snap;
      setSnapshot(snap);
      setEdited(null);
      builder.current?.load(snap.design);
      const lines: ReceiptLine[] = [];
      let flown: string | null = null;
      if (before) {
        const old = new Map(before.blocks.map((b) => [b.id, b]));
        for (const b of snap.blocks) {
          const o = old.get(b.id);
          if (!o) lines.push({ tone: "structure", text: `New ${b.type} block`, detail: blockLabel(b) });
          else if (JSON.stringify(o.fields) !== JSON.stringify(b.fields) && b.type !== "html") {
            lines.push({ tone: "code", text: `${b.type} · ${b.id.replace("u_content_", "")}`, detail: blockLabel(b) });
            flown ??= changedWords(o.fields.text ?? "", b.fields.text ?? "");
          }
        }
        if (snap.blocks.length < before.blocks.length)
          lines.push({ tone: "structure", text: `${before.blocks.length - snap.blocks.length} block(s) removed` });
      }
      if (held.length) lines.push({ tone: "conflict", text: `${held.length} held-back builder edit(s) replaced by the code` });
      setHeld([]);
      heldKey.current = "[]";
      if (!lines.length) lines.push({ tone: "info", text: "Same design, re-sent", detail: note });
      const ms = Math.round(performance.now() - t0);
      // A code edit: the edited word flies from its line into the builder.
      const typed = who === "engineer" && note === undefined && before && flown;
      if (typed) {
        const file = [DATA, ENTRY].find((f) => before.files[f] !== next[f]) ?? DATA;
        const line = changedLines(before.files[file], next[file])[0];
        flyWord("right", flown!, "toDesign() → builder", line);
      }
      fly("right", `design.json · ${snap.blocks.length} blocks`, Boolean(typed));
      setTrips((t) => ({ ...t, push: t.push + 1 }));
      addReceipt({ who, title: note ?? "Code → builder", ms, lines });
      // A code edit typed in the studio: the tour's third step.
      if (who === "engineer" && note === undefined)
        setTour((t) => (t && t.step === 2 ? { step: 3, note: "toDesign() sent your code edit straight into the builder." } : t));
      void check(snap);
    },
    [addReceipt, check, fly, flyWord, held.length],
  );

  // First checks, on the first build.
  useEffect(() => {
    if (snapRef.current) void check(snapRef.current);
  }, [check]);

  // Load the first design once the builder is up.
  const firstLoad = useRef(false);
  useEffect(() => {
    if (builderReady && snapRef.current && !firstLoad.current) {
      firstLoad.current = true;
      builder.current?.load(snapRef.current.design);
      fly("right", `design.json · ${snapRef.current.blocks.length} blocks`);
      setTrips((t) => ({ ...t, push: t.push + 1 }));
    }
  }, [builderReady, fly]);

  // Dev only: is the template folder writable from here?
  useEffect(() => {
    // The route answers 404 outside development: don't leave a failed request in every visitor's console.
    if (process.env.NODE_ENV !== "development") return;
    fetch("/api/template")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { files?: Record<string, string> } | null) => {
        if (d?.files) {
          diskSeen.current = d.files;
          setDisk({ enabled: true, on: false });
        }
      })
      .catch(() => undefined);
  }, []);

  // Dev only: watch the files on disk, so an edit in your own editor reaches the builder.
  useEffect(() => {
    if (!disk.on) return;
    const timer = setInterval(async () => {
      const d = (await fetch("/api/template").then((r) => r.json()).catch(() => null)) as { files?: Record<string, string> } | null;
      if (!d?.files || !diskSeen.current) return;
      const changed = Object.keys(d.files).filter((f) => d.files![f] !== diskSeen.current![f]);
      if (!changed.length) return;
      diskSeen.current = d.files;
      const next = { ...filesRef.current, ...d.files };
      setFiles(next);
      push(next, "engineer", `Saved in your editor: ${changed.join(", ")}`);
    }, 1200);
    return () => clearInterval(timer);
  }, [disk.on, push]);

  const onCodeChange = (file: string, text: string) => {
    const next = { ...filesRef.current, [file]: text };
    filesRef.current = next;
    setFiles(next);
    setAuthors((a) => (a.includes("engineer") ? a : [...a, "engineer"]));
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => {
      push(next);
      void writeDisk(next);
    }, 650);
  };

  /** Builder -> code. */
  const onBuilderEdit = useCallback(
    (design: Design) => {
      const snap = snapRef.current;
      if (!snap) return;
      setEdited(design);
      const t0 = performance.now();
      const result = pull(snap, design);
      const pending = result.changes.filter((c) => c.kind !== "copy" && c.kind !== "code");
      const pendingKey = JSON.stringify(pending);
      // Receipt only for what's newly held back: the panel above keeps the full list.
      const seen = new Set((JSON.parse(heldKey.current) as Change[]).map((c) => JSON.stringify(c)));
      const fresh = pending.filter((c) => !seen.has(JSON.stringify(c)));
      if (fresh.length && !result.applied) {
        addReceipt({ who: "marketer", title: "Builder edit held back", ms: 0, lines: fresh.map(describe) });
      }
      heldKey.current = pendingKey;
      setHeld(pending);
      // A newly refused edit: stamp it on the builder, and tick the tour's second step.
      const refusal = fresh.find(
        (c): c is Extract<Change, { kind: "conflict" }> => c.kind === "conflict" && /template refuses/.test(c.reason),
      );
      if (refusal) {
        const id = ++ids.current;
        setStamp({ id, ...stampFor(refusal.reason, refusal.after) });
        setTimeout(() => setStamp((s) => (s?.id === id ? null : s)), 3000);
        setTour((t) => (t && t.step === 1 ? { step: 2, note: refusal.reason } : t));
      }
      if (!result.applied) return;

      const before = filesRef.current;
      const next = { ...before, ...result.files };
      let snapNext: Snapshot;
      try {
        snapNext = build(next);
      } catch (e) {
        setCompileError(locateError(next, (e as Error).message));
        return;
      }
      snapRef.current = snapNext;
      setSnapshot(snapNext);
      filesRef.current = next;
      setFiles(next);
      setAuthors((a) => (a.includes("marketer") ? a : [...a, "marketer"]));
      const touched = [DATA, ENTRY].filter((f) => next[f] !== before[f]);
      const target = touched[0];
      if (target) {
        setActive(target);
        setFlash({ file: target, lines: changedLines(before[target], next[target]), key: ++ids.current });
      }
      if (target === DATA && result.changes.some((c) => c.kind === "copy")) {
        const line = changedLines(before[DATA], next[DATA])[0];
        setTour((t) => (t && t.step === 0 ? { step: 1, note: `Landed on ${DATA}, line ${line}. One line, nothing else.` } : t));
      }
      const ms = Math.round(performance.now() - t0);
      // The edited word flies from the builder to the line it landed on.
      const landed = result.changes.find((c): c is Extract<Change, { kind: "copy" | "code" }> => c.kind === "copy" || c.kind === "code");
      const word = landed ? (changedWords(landed.before, landed.after) ?? landed.after) : null;
      if (target && word) {
        const line = changedLines(before[target], next[target])[0];
        flyWord("left", word, `${target}:${line}`, line);
      }
      fly("left", touched.map((f) => `${f} +${changedLines(before[f], next[f]).length}`).join(" · "), Boolean(target && word));
      setTrips((t) => ({ ...t, pull: t.pull + 1 }));
      addReceipt({
        who: "marketer",
        title: "Builder → code",
        ms,
        lines: result.changes.map(describe),
      });
      void writeDisk(next);
      void check(snapNext);
    },
    [addReceipt, check, fly, flyWord, writeDisk],
  );

  /** Opens the change request: also the tour's last step. */
  const openReview = () => {
    setReviewOpen(true);
    setTour((t) => (t && t.step === 3 ? { step: 4, note: "That’s the round trip: builder → code → builder, as a pull request." } : t));
  };

  useEffect(() => {
    onBuilderEditRef.current = onBuilderEdit;
  }, [onBuilderEdit]);

  // Dev only: read the current design, and feed one through the same path as a builder edit (QA and captures).
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const w = window as unknown as { __rtPull?: (d: Design) => void; __rtDesign?: () => Design | undefined };
    w.__rtPull = (d) => onBuilderEditRef.current(d);
    w.__rtDesign = () => snapRef.current?.design;
  }, []);

  /** Opens a file at a line and flashes it: build errors and the ownership map use this. */
  const jumpTo = (file: string, lines: number[]) => {
    setActive(file);
    setFlash({ file, lines, key: ++ids.current });
  };

  /** Where a block comes from: its lines in the values file, or the JSX that writes it. */
  const sourceOf = (o: Owned): { file: string; lines: number[] } | null => {
    if (o.rawPaths.length) {
      const lines = o.rawPaths.map((p) => jsonValueLine(files[DATA], filePath(p))).filter((n): n is number => n !== null);
      return lines.length ? { file: DATA, lines } : null;
    }
    const tsx = files[ENTRY];
    const lineOf = (needle: string) => {
      const at = needle ? tsx.indexOf(needle) : -1;
      return at < 0 ? null : tsx.slice(0, at).split("\n").length;
    };
    const tag = (name: string) => lineOf(`<${name}`);
    let line: number | null = null;
    if (o.owner === "code-text") {
      // Text split across markup ("KESTREL" + <Span>.</Span>): fall back to its first word.
      const text = o.block.fields.text ?? "";
      line = lineOf(text.slice(0, 24)) ?? lineOf(text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]{2,}/u)?.[0] ?? "");
    }
    else if (o.owner === "locked") line = /IssueStamp/.test(o.label) ? tag("IssueStamp") : tag("Layer");
    else line = tag(o.block.type.charAt(0).toUpperCase() + o.block.type.slice(1));
    return line ? { file: ENTRY, lines: [line] } : null;
  };

  const reset = () => {
    filesRef.current = HEAD;
    setFiles(HEAD);
    setHead(HEAD);
    setAuthors([]);
    setActive(ENTRY);
    setFlash(null);
    push(HEAD, "engineer", "Reset to the committed template");
    void writeDisk(HEAD);
  };

  const merge = () => {
    const lines = Object.keys(filesRef.current)
      .filter((f) => filesRef.current[f] !== head[f])
      .map((f) => ({ tone: "code" as const, text: `template/${f}`, detail: "merged into main" }));
    setHead(filesRef.current);
    setAuthors([]);
    setReviewOpen(false);
    addReceipt({ who: "engineer", title: "Change request merged", ms: 0, lines });
  };

  /** Plays the whole round trip through the real pipeline, with captions. */
  const playDemo = async () => {
    if (director) {
      stopDemo.current = true;
      return;
    }
    stopDemo.current = false;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const go = async (step: number, focus: Director["focus"], caption: string, ms: number) => {
      if (stopDemo.current) throw new Error("stopped");
      setDirector({ step, focus, caption });
      await sleep(ms);
    };
    try {
      setIntroOpen(false);
      setTour(null);
      setTab("receipts");
      setDockOpen(true);
      await go(1, "builder", "The marketer opens the newsletter in Unlayer’s builder…", 1800);
      const design = await builder.current?.save();
      if (!design) throw new Error("no builder");
      const next = structuredClone(design);
      // Read the direction from the headline block itself: the preheader repeats the same words.
      let headline: Record<string, unknown> | null = null;
      for (const row of next.body.rows as { columns: { contents: { values: Record<string, unknown> }[] }[] }[])
        for (const col of row.columns)
          for (const c of col.contents)
            if ((c.values._meta as { htmlID?: string } | undefined)?.htmlID === "u_content_heading_1") headline = c.values;
      if (!headline) throw new Error("no headline");
      const [from, to] = String(headline.text ?? "").includes("that build ") ? ["build", "draw"] : ["draw", "build"];
      for (const key of ["text", "textJson"])
        if (typeof headline[key] === "string") headline[key] = (headline[key] as string).replace(`that ${from} `, `that ${to} `);
      await go(2, "builder", `…and retypes one word of the headline: “${from}” → “${to}”.`, 900);
      builder.current?.load(next);
      onBuilderEditRef.current(next);
      await go(3, "code", "Round Trip traced the word to the template’s values file, checked it, and patched that one line.", 2600);
      setTab("diff");
      await go(4, "dock", "The git diff: one line. The loops in Newsletter.tsx are untouched.", 3000);
      // The guardrail: the template refuses a headline over its limit, and the code stays put.
      const longer = structuredClone(next);
      for (const row of longer.body.rows as { columns: { contents: { values: Record<string, unknown> }[] }[] }[])
        for (const col of row.columns)
          for (const c of col.contents)
            if ((c.values._meta as { htmlID?: string } | undefined)?.htmlID === "u_content_heading_1")
              for (const key of ["text", "textJson"])
                if (typeof c.values[key] === "string")
                  c.values[key] = (c.values[key] as string).replace("themselves", "themselves and write your release notes too");
      await go(5, "builder", "The marketer tries a much longer headline…", 1300);
      setTab("receipts");
      builder.current?.load(longer);
      onBuilderEditRef.current(longer);
      await go(6, "builder", "…and the template refuses it: a Headline is 48 characters at most. The code stays as it was.", 3200);
      push(filesRef.current, "engineer", "Builder put back to match the code");
      setActive(DATA);
      await go(7, "code", "Now the engineer renames a feature, in code…", 1200);
      // Types " 2.0" onto the first feature, or backspaces it away on a second run,
      // so every run shows a real code edit reaching the builder.
      const issue = JSON.parse(filesRef.current[DATA]) as { values: { features: { title: string }[] } };
      const current = issue.values.features[0].title;
      const base = current.replace(/ 2\.0$/, "");
      const target = current === base ? `${base} 2.0` : base;
      const frames =
        target.length > current.length
          ? Array.from({ length: target.length - current.length }, (_, i) => target.slice(0, current.length + i + 1))
          : Array.from({ length: current.length - target.length }, (_, i) => current.slice(0, current.length - i - 1));
      for (const title of frames) {
        if (stopDemo.current) throw new Error("stopped");
        const text = patchJsonValue(filesRef.current[DATA], filePath(["features", 0, "title"]), title);
        if (text) onCodeChange(DATA, text);
        await sleep(200);
      }
      await go(8, "builder", "…and toDesign() puts it straight into the builder.", 2600);
      setTab("clients");
      await go(9, "dock", "After every trip, nine email clients are re-checked by the emulator.", 3200);
      await go(DEMO_STEPS, null, "Ship it like code: a change request with the email before and after.", 1400);
      setReviewOpen(true);
      await go(DEMO_STEPS, null, "Approve and merge, or send it back. Your turn.", 3200);
    } catch {
      // stopped
    } finally {
      setDirector(null);
    }
  };

  const owned = useMemo(() => (snapshot ? ownership(snapshot) : []), [snapshot]);
  const counts = useMemo(() => {
    const c: Record<Owner, number> = { copy: 0, "code-text": 0, locked: 0, fixed: 0 };
    for (const o of owned) c[o.owner]++;
    return c;
  }, [owned]);
  const flat = useMemo(() => {
    if (tab !== "flat" || !snapshot) return null;
    try {
      return flatJsx(edited ?? snapshot.design);
    } catch (e) {
      return { code: `// ${(e as Error).message}`, report: [] };
    }
  }, [tab, edited, snapshot]);
  const dirty = useMemo(() => Object.fromEntries(Object.keys(files).map((f) => [f, files[f] !== head[f]])), [files, head]);
  const dirtyCount = Object.values(dirty).filter(Boolean).length;
  const passing = checks ? checks.clients.filter((c) => c.errors === 0).length : null;
  // One focus ring for the demo, the intro and the tour, in that order.
  const focus: Focus = director?.focus ?? (introOpen ? guideFocus : tourFocus(tour));
  const phone = useSyncExternalStore(subscribePhone, phoneNow, () => false);
  if (phone) return <PhoneStudio />;

  return (
    <div className={styles.studio}>
      <header className={styles.top}>
        <Link href="/" prefetch={false} className={styles.mark}>
          <span className={styles.markBlue}>Round</span>
          <span className={styles.markOrange}>Trip</span>
        </Link>
        <span className={styles.topNote}>Kestrel Dispatch · newsletter template</span>
        <div className={styles.topRight}>
          <span className={styles.counter} title="Trips from code to the builder, and back">
            <b data-dir="right">→ {trips.push}</b>
            <b data-dir="left">← {trips.pull}</b>
          </span>
          {disk.enabled && (
            <label className={styles.diskToggle} title="Dev only: write each trip to template/ and pick up saves from your own editor">
              <input type="checkbox" checked={disk.on} onChange={(e) => setDisk({ enabled: true, on: e.target.checked })} />
              <span>Sync with disk</span>
            </label>
          )}
          <button className={styles.ghostButton} onClick={() => setIntroOpen(true)} title="Replay the 20-second intro">
            Guide
          </button>
          <button className={styles.ghostButton} onClick={reset}>
            Reset
          </button>
          <button
            className={styles.reviewButton}
            onClick={openReview}
            disabled={!dirtyCount}
            data-pulse={(tour?.step === 3 && dirtyCount > 0) || undefined}
          >
            Review<span className={styles.more}> changes</span>
            {dirtyCount ? ` · ${dirtyCount}` : ""}
          </button>
          <button className={styles.playButton} onClick={playDemo} data-playing={Boolean(director)}>
            <i aria-hidden>{director ? "■" : "▶"}</i>
            {director ? (
              "Stop"
            ) : (
              <span>
                Watch<span className={styles.more}> a round trip</span>
              </span>
            )}
          </button>
        </div>
      </header>

      <AnimatePresence>
        {director && (
          <motion.div
            className={styles.director}
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
          >
            <span className={styles.directorStep}>
              {director.step}/{DEMO_STEPS}
            </span>
            <AnimatePresence mode="wait">
              <motion.span
                key={director.caption}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
              >
                {director.caption}
              </motion.span>
            </AnimatePresence>
            <span className={styles.directorBar}>
              <motion.i animate={{ width: `${(director.step / DEMO_STEPS) * 100}%` }} />
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <ReviewModal
        open={reviewOpen}
        head={head}
        files={files}
        checks={checks}
        authors={authors}
        onClose={() => setReviewOpen(false)}
        onMerge={merge}
      />

      <Intro
        open={introOpen}
        ready={builderReady}
        onFocus={setGuideFocus}
        onTry={() => {
          markGuideSeen();
          setIntroOpen(false);
          setGuideFocus(null);
          setTour({ step: 0 });
        }}
        onWatch={() => {
          markGuideSeen();
          setIntroOpen(false);
          setGuideFocus(null);
          void playDemo();
        }}
      />

      <main ref={stageRef} className={styles.stage} data-focus={focus ?? undefined}>
        <CodePanel
          files={files}
          active={active}
          owners={OWNERS}
          onActive={setActive}
          onChange={onCodeChange}
          flash={flash}
          error={compileError}
          onJump={jumpTo}
          dirty={dirty}
        />

        <div className={styles.wire} aria-hidden>
          <div className={styles.wireLane} data-dir="right">
            <span className={styles.wireLabel}>toDesign()</span>
          </div>
          <div className={styles.wireCore}>
            <span className={styles.wireDot} data-on={flights.some((f) => f.dir === "right")} data-dir="right" />
            <span className={styles.wireDot} data-on={flights.some((f) => f.dir === "left")} data-dir="left" />
          </div>
          <div className={styles.wireLane} data-dir="left">
            <span className={styles.wireLabel}>fromDesign() + trace</span>
          </div>
        </div>

        <section className={styles.builder} aria-label="Unlayer builder">
          <header className={styles.panelHead}>
            <span className={styles.role} data-role="marketer">
              <i /> Marketer
            </span>
            <span className={styles.panelTitle}>Unlayer builder</span>
            <span className={styles.panelMeta}>
              {counts.copy + counts["code-text"]} editable · {counts.locked} locked
            </span>
          </header>
          <div className={styles.builderFrame}>
            <Builder ref={builder} onReady={() => setBuilderReady(true)} onEdit={onBuilderEdit} onError={setBuilderError} />
            <AnimatePresence>
              {!builderReady && (
                <motion.div className={styles.builderLoading} exit={{ opacity: 0 }}>
                  <span className={styles.loadingDots}>
                    <i />
                    <i />
                    <i />
                  </span>
                  {builderError ?? "Loading Unlayer's builder…"}
                </motion.div>
              )}
            </AnimatePresence>
            <AnimatePresence>
              {stamp && (
                <motion.div
                  key={stamp.id}
                  className={styles.stampWrap}
                  role="status"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0.4 } }}
                >
                  <motion.div
                    className={styles.refused}
                    initial={{ scale: 2.6, rotate: -26, opacity: 0, y: -40 }}
                    animate={{ scale: 1, rotate: -9, opacity: 1, y: 0 }}
                    transition={{ type: "spring", stiffness: 520, damping: 17, mass: 0.9 }}
                  >
                    <b>Refused</b>
                    <span>{stamp.rule}</span>
                    {stamp.wrote && <small>{stamp.wrote}</small>}
                    <em>kestrel.Newsletter · check()</em>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
            <Tour tour={builderReady && !director ? tour : null} onSkip={() => setTour(null)} />
          </div>
        </section>

        <div className={styles.flightLayer} aria-hidden>
          <AnimatePresence>
            {flights.filter((f) => !f.quiet).map((f) => (
              <motion.div
                key={f.id}
                className={styles.slip}
                data-dir={f.dir}
                initial={{ left: f.dir === "right" ? "22%" : "70%", top: "52%", rotate: f.dir === "right" ? -8 : 8, opacity: 0, scale: 0.6 }}
                animate={{
                  left: f.dir === "right" ? ["22%", "46%", "70%"] : ["70%", "46%", "22%"],
                  top: ["52%", "30%", "52%"],
                  rotate: f.dir === "right" ? [-8, 4, 10] : [8, -4, -10],
                  opacity: [0, 1, 0],
                  scale: [0.6, 1, 0.7],
                }}
                transition={{ duration: 1.3, ease: [0.45, 0, 0.2, 1] }}
              >
                <span>{f.dir === "right" ? "toDesign()" : "patch"}</span>
                <b>{f.label}</b>
              </motion.div>
            ))}
          </AnimatePresence>
          {words.map((w) => {
            const mid = { x: (w.from.x + w.to.x) / 2, y: Math.min(w.from.y, w.to.y) - 150 };
            return (
              <div key={w.id}>
                <motion.div
                  className={styles.wordSlip}
                  data-dir={w.dir}
                  style={{ left: 0, top: 0 }}
                  initial={{ x: w.from.x, y: w.from.y, scale: 0.5, rotate: w.dir === "left" ? 10 : -10, opacity: 0 }}
                  animate={{
                    x: [w.from.x, mid.x, w.to.x],
                    y: [w.from.y, mid.y, w.to.y],
                    scale: [0.5, 1.2, 0.62],
                    rotate: w.dir === "left" ? [10, -5, 0] : [-10, 5, 0],
                    opacity: [0, 1, 1],
                  }}
                  transition={{ duration: 1.05, times: [0, 0.48, 1], ease: [0.45, 0, 0.2, 1] }}
                >
                  <motion.div animate={{ opacity: [1, 1, 0] }} transition={{ duration: 1.6, times: [0, 0.75, 1] }}>
                    <b>{w.word}</b>
                    <span>{w.caption}</span>
                  </motion.div>
                </motion.div>
                <motion.span
                  className={styles.splash}
                  data-dir={w.dir}
                  style={{ left: w.to.x, top: w.to.y }}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: [0, 1, 1.7], opacity: [0, 0.9, 0] }}
                  transition={{ delay: 0.95, duration: 0.7, times: [0, 0.3, 1] }}
                />
              </div>
            );
          })}
        </div>
      </main>

      <motion.section className={styles.dock} data-focus={focus === "dock" || undefined} animate={{ height: dockOpen ? "31vh" : 46 }} transition={{ type: "spring", stiffness: 260, damping: 30 }}>
        <nav className={styles.dockTabs}>
          {(
            [
              ["receipts", "Trips", receipts.length || ""],
              ["diff", "Git diff", dirtyCount ? `${dirtyCount} file${dirtyCount > 1 ? "s" : ""}` : ""],
              ["ownership", "Ownership map", `${owned.length}`],
              ["clients", "Email clients", passing === null ? "…" : `${passing}/9`],
              ["flat", "fromDesign()", ""],
            ] as const
          ).map(([id, label, badge]) => (
            <button
              key={id}
              role="tab"
              className={styles.dockTab}
              aria-selected={tab === id}
              onClick={() => {
                setTab(id);
                setDockOpen(true);
              }}
            >
              {tab === id && <motion.span layoutId="dock-tab" className={styles.dockInk} />}
              <span>{label}</span>
              {badge !== "" && <em data-tone={id === "clients" && checking ? "wait" : id}>{badge}</em>}
            </button>
          ))}
          {held.length > 0 && (
            <button className={styles.heldPill} onClick={() => setTab("receipts")}>
              {held.length} held back
            </button>
          )}
          <button className={styles.dockToggle} onClick={() => setDockOpen((o) => !o)} aria-label="Toggle panel">
            {dockOpen ? "▾" : "▴"}
          </button>
        </nav>
        <div className={styles.dockBody}>
          {tab === "receipts" && (
            <div className={styles.receipts}>
              {held.length > 0 && (
                <div className={styles.heldBox}>
                  <div className={styles.heldHead}>
                    <strong>Held back in the builder</strong>
                    <button
                      className={styles.ghostButton}
                      onClick={() => push(filesRef.current, "engineer", "Builder put back to match the code")}
                      title="Reload the builder from the code, dropping these edits"
                    >
                      Put the builder back
                    </button>
                  </div>
                  {held.map((c, i) => {
                    const d = describe(c);
                    return (
                      <p key={i}>
                        {d.text} <span className={styles.dim}>{d.detail}</span>
                      </p>
                    );
                  })}
                </div>
              )}
              {!receipts.length && <p className={styles.dim}>Every trip prints a receipt here.</p>}
              <AnimatePresence initial={false}>
                {receipts.map((r) => (
                  <motion.article
                    key={r.id}
                    layout
                    className={styles.receipt}
                    data-who={r.who}
                    initial={{ clipPath: "inset(0 0 100% 0)", y: -12 }}
                    animate={{ clipPath: "inset(0 0 0% 0)", y: 0 }}
                    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <header>
                      <span className={styles.receiptWho}>{r.who === "engineer" ? "ENG" : "MKT"}</span>
                      <strong>{r.title}</strong>
                      <span className={styles.dim}>
                        {r.time}
                        {r.ms ? ` · ${r.ms} ms` : ""}
                      </span>
                    </header>
                    {r.lines.map((l, i) => (
                      <p key={i} data-tone={l.tone}>
                        <span>{l.text}</span>
                        {l.detail && <em>{l.detail}</em>}
                      </p>
                    ))}
                  </motion.article>
                ))}
              </AnimatePresence>
            </div>
          )}
          {tab === "diff" && <DiffView head={head} files={files} />}
          {tab === "ownership" && (
            <div className={styles.ownership}>
              <div className={styles.legend}>
                {(Object.keys(OWNER_INFO) as Owner[]).map((o) => (
                  <div key={o} className={styles.legendItem} data-owner={o}>
                    <i />
                    <div>
                      <strong>
                        {OWNER_INFO[o].name} · {counts[o]}
                      </strong>
                      <span>{OWNER_INFO[o].hint}</span>
                    </div>
                  </div>
                ))}
                <p className={styles.dim}>
                  Read from <code>toDesign()</code>’s report and a traced second render; each field’s label and limit
                  from the template’s <code>describe()</code>. Click a block to see the line it comes from.
                </p>
              </div>
              <div className={styles.blocks}>
                {owned.map((o, i) => {
                  const source = sourceOf(o);
                  return (
                    <motion.button
                      key={o.block.id}
                      className={styles.blockChip}
                      data-owner={o.owner}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.012 }}
                      disabled={!source}
                      onClick={() => source && jumpTo(source.file, source.lines)}
                      title={
                        [
                          source && `Show it in ${source.file}, line ${source.lines.join(", ")}`,
                          ...o.fields.map((f) => f.guidance && `${f.label}: ${f.guidance}`),
                        ]
                          .filter(Boolean)
                          .join("\n") || undefined
                      }
                    >
                      <span className={styles.blockType}>{o.block.type}</span>
                      <span className={styles.blockLabel}>{o.label}</span>
                      {o.fields.length > 0 && (
                        <code>
                          {o.fields.map((f) => `${f.label}${f.maxLength ? ` ≤${f.maxLength}` : ""} · ${f.path}`).join(", ")}
                        </code>
                      )}
                      {source && (
                        <span className={styles.blockSource}>
                          {source.file}:{source.lines[0]} ↗
                        </span>
                      )}
                    </motion.button>
                  );
                })}
              </div>
            </div>
          )}
          {tab === "clients" && <ClientStamps result={checks} running={checking} runKey={checkKey} />}
          {tab === "flat" && flat && (
            <div className={styles.flat}>
              <p>
                This is what <code>fromDesign()</code> returns for the builder’s current design: correct, but flat. Loops are
                unrolled and data is baked in. Round Trip uses it as the ground truth, then traces each edit back to
                the line in <code>issue.values.json</code> or <code>Newsletter.tsx</code> it came from.
              </p>
              <pre>{flat.code}</pre>
            </div>
          )}
        </div>
      </motion.section>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
}

// The template as it was when this page opened. Kept on globalThis so that, with
// "Sync with disk" on, our own writes (re-embedded by the dev watcher) don't move it.
const HEAD: Record<string, string> = ((globalThis as { __rtHead?: Record<string, string> }).__rtHead ??= {
  ...TEMPLATE_SOURCES,
});
const OWNERS = { "Newsletter.tsx": "engineer", "theme.ts": "engineer", "issue.values.json": "shared" } as const;
type DockTab = "receipts" | "diff" | "ownership" | "clients" | "flat";

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
  const [active, setActive] = useState<string>(ENTRY);
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
  const [flash, setFlash] = useState<Flash | null>(null);
  const [checks, setChecks] = useState<CheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkKey, setCheckKey] = useState(0);
  const [held, setHeld] = useState<Change[]>([]);
  const [edited, setEdited] = useState<Design | null>(null);
  const [tab, setTab] = useState<DockTab>("receipts");
  const [dockOpen, setDockOpen] = useState(true);
  const [trips, setTrips] = useState({ push: 0, pull: 0 });
  const [coach, setCoach] = useState(true);
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

  const fly = useCallback((dir: Flight["dir"], label: string) => {
    const id = ++ids.current;
    setFlights((f) => [...f, { id, dir, label }]);
    setTimeout(() => setFlights((f) => f.filter((x) => x.id !== id)), 1500);
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
      if (before) {
        const old = new Map(before.blocks.map((b) => [b.id, b]));
        for (const b of snap.blocks) {
          const o = old.get(b.id);
          if (!o) lines.push({ tone: "structure", text: `New ${b.type} block`, detail: blockLabel(b) });
          else if (JSON.stringify(o.fields) !== JSON.stringify(b.fields) && b.type !== "html")
            lines.push({ tone: "code", text: `${b.type} · ${b.id.replace("u_content_", "")}`, detail: blockLabel(b) });
        }
        if (snap.blocks.length < before.blocks.length)
          lines.push({ tone: "structure", text: `${before.blocks.length - snap.blocks.length} block(s) removed` });
      }
      if (held.length) lines.push({ tone: "conflict", text: `${held.length} held-back builder edit(s) replaced by the code` });
      setHeld([]);
      heldKey.current = "[]";
      if (!lines.length) lines.push({ tone: "info", text: "Same design, re-sent", detail: note });
      const ms = Math.round(performance.now() - t0);
      fly("right", `design.json · ${snap.blocks.length} blocks`);
      setTrips((t) => ({ ...t, push: t.push + 1 }));
      addReceipt({ who, title: note ?? "Code → builder", ms, lines });
      void check(snap);
    },
    [addReceipt, check, fly, held.length],
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
      setCoach(false);
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
      const ms = Math.round(performance.now() - t0);
      fly("left", touched.map((f) => `${f} +${changedLines(before[f], next[f]).length}`).join(" · "));
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
    [addReceipt, check, fly, writeDisk],
  );

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
      setCoach(false);
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
      setActive(DATA);
      await go(5, "code", "Now the engineer renames a feature, in code…", 1200);
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
      await go(6, "builder", "…and toDesign() puts it straight into the builder.", 2600);
      setTab("clients");
      await go(7, "dock", "After every trip, nine email clients are re-checked by the emulator.", 3200);
      await go(8, null, "Ship it like code: a change request with the email before and after.", 1400);
      setReviewOpen(true);
      await go(8, null, "Approve and merge, or send it back. Your turn.", 3200);
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
          <button className={styles.ghostButton} onClick={reset}>
            Reset
          </button>
          <button className={styles.reviewButton} onClick={() => setReviewOpen(true)} disabled={!dirtyCount}>
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
            <span className={styles.directorStep}>{director.step}/8</span>
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
              <motion.i animate={{ width: `${(director.step / 8) * 100}%` }} />
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

      <main className={styles.stage} data-focus={director?.focus ?? undefined}>
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
              {builderReady && coach && (
                <motion.aside
                  className={styles.coach}
                  initial={{ opacity: 0, y: 20, rotate: -3 }}
                  animate={{ opacity: 1, y: 0, rotate: -1.5 }}
                  exit={{ opacity: 0, y: -10, scale: 0.9 }}
                  transition={{ delay: 1.2, type: "spring", stiffness: 200, damping: 18 }}
                >
                  <b>Try it</b>
                  <ol>
                    <li>Click the headline “Dashboards that build themselves” and change a word.</li>
                    <li>Watch issue.values.json on the left: that exact line changes.</li>
                    <li>Edit a feature title in issue.values.json: the builder follows.</li>
                  </ol>
                  <button onClick={() => setCoach(false)}>Got it</button>
                </motion.aside>
              )}
            </AnimatePresence>
          </div>
        </section>

        <div className={styles.flightLayer} aria-hidden>
          <AnimatePresence>
            {flights.map((f) => (
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
        </div>
      </main>

      <motion.section className={styles.dock} data-focus={director?.focus === "dock" || undefined} animate={{ height: dockOpen ? "31vh" : 46 }} transition={{ type: "spring", stiffness: 260, damping: 30 }}>
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

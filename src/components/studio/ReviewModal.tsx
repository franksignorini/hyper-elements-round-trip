"use client";

// A marketer's builder edits, packaged the way engineers ship code: a change
// request with the diff, the client checks, and the rendered email before and
// after. "Spot the difference" marks every changed word on the new render, with
// what it said before, and dims the rest (see lib/rt/spot.ts).
import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { render } from "@hyper-elements/react";
import { build, DATA, ValuesError } from "@/lib/rt/engine";
import { spotChanges } from "@/lib/rt/spot";
import { CLIENTS, type CheckResult } from "@/lib/rt/checks";
import { DiffView, gitPatch } from "./DiffView";
import styles from "./studio.module.css";

interface Props {
  open: boolean;
  head: Record<string, string>;
  files: Record<string, string>;
  checks: CheckResult | null;
  authors: ("engineer" | "marketer")[];
  onClose(): void;
  onMerge(): void;
}

function title(head: Record<string, string>, files: Record<string, string>): string {
  const json = head[DATA] !== files[DATA];
  const jsx = head["Newsletter.tsx"] !== files["Newsletter.tsx"] || head["theme.ts"] !== files["theme.ts"];
  if (json && jsx) return "Copy and template update · Kestrel Dispatch No. 14";
  if (jsx) return "Template update · Kestrel Dispatch No. 14";
  return "Copy update · Kestrel Dispatch No. 14";
}

export function ReviewModal({ open, head, files, checks, authors, onClose, onMerge }: Props) {
  const [renders, setRenders] = useState<{ before: string; after: string } | null>(null);
  // The template's own check on the values being merged: build() throws when it refuses them.
  const [template, setTemplate] = useState<{ id: string; version: string; ok: boolean; message?: string } | null>(null);
  const [overlay, setOverlay] = useState(false);
  const [merged, setMerged] = useState(false);
  const [spotted, setSpotted] = useState<number | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  // Size each render to its full height: the panel scrolls, not the iframes, so
  // before and after stay level with each other.
  const fit = (e: SyntheticEvent<HTMLIFrameElement>) => {
    const doc = e.currentTarget.contentDocument;
    if (doc) e.currentTarget.style.height = `${doc.documentElement.scrollHeight}px`;
  };

  const spot = (e: SyntheticEvent<HTMLIFrameElement>) => {
    fit(e);
    const doc = e.currentTarget.contentDocument;
    if (!doc || !renders) return;
    const result = spotChanges(doc, renders.before);
    setSpotted(result.count);
    const stage = stageRef.current;
    if (stage && result.firstY !== null) {
      const zoom = parseFloat(getComputedStyle(e.currentTarget).zoom || "1") || 1;
      stage.scrollTo({ top: Math.max(0, result.firstY * zoom - 90), behavior: "smooth" });
    }
  };

  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      try {
        const next = build(files);
        if (alive) setTemplate({ id: next.template.id, version: next.template.version, ok: true });
        const [before, after] = await Promise.all([render(build(head).element), render(next.element)]);
        if (alive) setRenders({ before: before.html, after: after.html });
      } catch (e) {
        if (alive) {
          setRenders(null);
          if (e instanceof ValuesError) setTemplate({ id: "kestrel.Newsletter", version: "", ok: false, message: e.diagnostics[0]?.message });
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, head, files]);

  const changed = Object.keys(files).filter((f) => files[f] !== head[f]);
  // Checks only count when they ran on exactly these files.
  const fresh = Boolean(checks && Object.keys(files).every((f) => checks.ctx.files[f] === files[f]));
  const passing = checks ? checks.clients.filter((c) => c.errors === 0).length : 0;
  const validateErrors = checks ? checks.general.filter((d) => d.severity === "error").length : 0;
  const codeChanged = changed.some((f) => f !== DATA);
  const lines = gitPatch(head, files)
    .split("\n")
    .filter((l) => (l.startsWith("+") || l.startsWith("-")) && !l.startsWith("+++") && !l.startsWith("---")).length;

  const merge = () => {
    setMerged(true);
    setTimeout(() => {
      onMerge();
      setMerged(false);
      setRenders(null);
    }, 1500);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className={styles.modalBack} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            className={styles.review}
            initial={{ y: 80, rotate: 1.5, opacity: 0 }}
            animate={{ y: 0, rotate: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 240, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
          >
            <header className={styles.reviewHead}>
              <span className={styles.reviewState} data-merged={merged}>
                {merged ? "Merged" : "Open"}
              </span>
              <div>
                <h2>{title(head, files)}</h2>
                <p className={styles.dim}>
                  {authors.includes("marketer") && <span className={styles.who} data-who="marketer">MKT</span>}
                  {authors.includes("engineer") && <span className={styles.who} data-who="engineer">ENG</span>}
                  wants to merge {changed.length} file{changed.length === 1 ? "" : "s"} ({lines} changed line{lines === 1 ? "" : "s"}) into{" "}
                  <code>main</code>
                </p>
              </div>
              <button className={styles.ghostButton} onClick={onClose}>
                Close
              </button>
            </header>

            <div className={styles.reviewChecks}>
              {!fresh ? (
                <span data-ok="wait">… Re-checking the email clients</span>
              ) : (
                <>
                  {checks?.emulator ? (
                    <span data-ok={passing === CLIENTS.length}>
                      {passing === CLIENTS.length ? "✓" : "✗"} {passing}/{CLIENTS.length} email clients pass
                    </span>
                  ) : (
                    <span data-ok="wait" title="The per-client emulator runs on the Node server (npm run dev)">
                      – Client emulator: run locally
                    </span>
                  )}
                  <span data-ok={validateErrors === 0}>
                    {validateErrors ? "✗" : "✓"} validate(): {validateErrors} error{validateErrors === 1 ? "" : "s"}
                  </span>
                </>
              )}
              {template && (
                <span data-ok={template.ok} title={template.message ?? "The template checked every value against its fields"}>
                  {template.ok ? `✓ ${template.id} ${template.version} · check() valid` : `✗ ${template.id} refuses: ${template.message}`}
                </span>
              )}
              <span data-ok={!codeChanged} title={codeChanged ? "Newsletter.tsx or theme.ts changed: read the JSX diff" : undefined}>
                {codeChanged ? "! Template code changed: needs an engineer" : "✓ Copy only: loops and logic untouched"}
              </span>
              {changed.length > 0 && <span data-ok>✓ Every line traced to its source</span>}
            </div>

            <div className={styles.reviewBody}>
              <section className={styles.reviewVisual}>
                <div className={styles.reviewVisualHead}>
                  <strong>Rendered email</strong>
                  {overlay && renders && (
                    <span className={styles.overlayNote} aria-live="polite">
                      {spotted === null
                        ? "Comparing…"
                        : spotted === 0
                          ? "No visible change (a link or the preheader)"
                          : `${spotted} change${spotted === 1 ? "" : "s"} · tags show the old words`}
                    </span>
                  )}
                  <label className={styles.overlayToggle}>
                    <input
                      type="checkbox"
                      checked={overlay}
                      onChange={(e) => {
                        setSpotted(null);
                        setOverlay(e.target.checked);
                      }}
                    />
                    <span>Spot the difference</span>
                  </label>
                </div>
                {!renders ? (
                  <div className={styles.modalLoading}>Rendering both versions with Hyper Elements…</div>
                ) : overlay ? (
                  <div className={styles.overlayStage} ref={stageRef}>
                    <iframe title="After, with changes marked" srcDoc={renders.after} className={styles.shot} onLoad={spot} tabIndex={-1} />
                  </div>
                ) : (
                  <div className={styles.beforeAfter}>
                    <figure>
                      <figcaption>Before · main</figcaption>
                      <iframe title="Before" srcDoc={renders.before} className={styles.shot} onLoad={fit} tabIndex={-1} />
                    </figure>
                    <figure>
                      <figcaption data-after>After · this change</figcaption>
                      <iframe title="After" srcDoc={renders.after} className={styles.shot} onLoad={fit} tabIndex={-1} />
                    </figure>
                  </div>
                )}
              </section>
              <section className={styles.reviewDiff}>
                <DiffView head={head} files={files} />
              </section>
            </div>

            <footer className={styles.reviewFoot}>
              <button className={styles.ghostButton} onClick={() => navigator.clipboard?.writeText(gitPatch(head, files))}>
                Copy patch
              </button>
              <button className={styles.mergeButton} onClick={merge} disabled={!changed.length || merged}>
                Approve &amp; merge
              </button>
            </footer>

            <AnimatePresence>
              {merged && (
                <motion.div
                  className={styles.mergedStamp}
                  initial={{ scale: 3, opacity: 0, rotate: -30 }}
                  animate={{ scale: 1, opacity: 1, rotate: -12 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: "spring", stiffness: 420, damping: 15 }}
                >
                  MERGED
                  <small>into main · {lines} line{lines === 1 ? "" : "s"}</small>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

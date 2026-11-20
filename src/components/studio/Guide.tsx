"use client";

// The first ten seconds in the studio. The intro plays while Unlayer's builder loads:
// three beats, each lighting the panel it names. Then the tour: four steps that
// advance on real events (an edit that lands, an edit the template refuses, a code
// edit, the change request), so the visitor does the round trip themselves.
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import styles from "./studio.module.css";

export type Focus = "builder" | "code" | "dock" | null;

export const BEATS: { focus: Focus; who: string; tone: "blue" | "orange" | "over"; text: string }[] = [
  { focus: "code", who: "Engineer", tone: "blue", text: "keeps the newsletter in React: a Hyper Elements template, with typed fields." },
  { focus: "builder", who: "Marketer", tone: "orange", text: "edits the same email in Unlayer’s drag-and-drop builder." },
  {
    focus: "dock",
    who: "Round Trip",
    tone: "over",
    text: "sends every builder edit back as a one-line git diff, checked by the template and re-tested in nine email clients.",
  },
];

export function Intro({
  open,
  ready,
  onFocus,
  onTry,
  onWatch,
}: {
  open: boolean;
  ready: boolean;
  onFocus(f: Focus): void;
  onTry(): void;
  onWatch(): void;
}) {
  const [beat, setBeat] = useState(0);

  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => setBeat((b) => Math.min(b + 1, BEATS.length)), 1700);
    return () => clearInterval(timer);
  }, [open]);

  useEffect(() => {
    if (open) onFocus(beat < BEATS.length ? BEATS[beat].focus : null);
  }, [open, beat, onFocus]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className={styles.introBack} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.section
            className={styles.intro}
            role="dialog"
            aria-modal="true"
            aria-labelledby="intro-title"
            initial={{ y: 40, rotate: -1.5, scale: 0.96 }}
            animate={{ y: 0, rotate: 0, scale: 1 }}
            exit={{ y: -20, opacity: 0 }}
            transition={{ type: "spring", stiffness: 240, damping: 24 }}
          >
            <p className={styles.introKicker}>The studio · 20 seconds to get it</p>
            <h2 id="intro-title" className={styles.introTitle}>
              One email. <span data-tone="blue">Two</span> <span data-tone="orange">editors.</span>
            </h2>
            <ol className={styles.introBeats}>
              {BEATS.map((b, i) => (
                <motion.li
                  key={b.who}
                  data-tone={b.tone}
                  data-on={i === beat || undefined}
                  initial={{ opacity: 0, x: -18 }}
                  animate={{ opacity: i <= beat ? 1 : 0.18, x: i <= beat ? 0 : -18 }}
                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                >
                  <b>{b.who}</b> {b.text}
                </motion.li>
              ))}
            </ol>
            <div className={styles.introActions}>
              <button className={styles.introTry} onClick={onTry} disabled={!ready}>
                {ready ? (
                  <>
                    Try it yourself <i aria-hidden>→</i>
                  </>
                ) : (
                  <>
                    <span className={styles.loadingDots} aria-hidden>
                      <i />
                      <i />
                      <i />
                    </span>
                    Loading Unlayer’s builder
                  </>
                )}
              </button>
              <button className={styles.introWatch} onClick={onWatch} disabled={!ready}>
                <i aria-hidden>▶</i> Watch a 30s round trip
              </button>
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export interface TourState {
  step: number;
  /** What the last step found: the line an edit landed on, the template's refusal. */
  note?: string;
}

const STEPS: { ask: string; focus: Focus }[] = [
  { ask: "Click the headline in the builder and change one word.", focus: "builder" },
  { ask: "Now make the headline longer than 48 characters.", focus: "builder" },
  { ask: "Edit a feature title in issue.values.json, on the left.", focus: "code" },
  { ask: "Press Review changes: everything you did, as a pull request.", focus: null },
];

export const tourFocus = (t: TourState | null): Focus => (t && t.step < STEPS.length ? STEPS[t.step].focus : null);

export function Tour({ tour, onSkip }: { tour: TourState | null; onSkip(): void }) {
  const done = tour ? tour.step >= STEPS.length : false;
  return (
    <AnimatePresence>
      {tour && (
        <motion.aside
          className={styles.tour}
          aria-live="polite"
          initial={{ opacity: 0, y: 24, rotate: -3 }}
          animate={{ opacity: 1, y: 0, rotate: -1.2 }}
          exit={{ opacity: 0, y: -12, scale: 0.9 }}
          transition={{ type: "spring", stiffness: 220, damping: 20 }}
        >
          <header>
            <b>{done ? "Round trip complete" : `Try it · ${tour.step + 1}/${STEPS.length}`}</b>
            <button onClick={onSkip}>{done ? "Close" : "Skip"}</button>
          </header>
          <ol>
            {STEPS.map((s, i) => (
              <li key={i} data-state={i < tour.step ? "done" : i === tour.step ? "now" : "next"}>
                <span className={styles.tourMark} aria-hidden>
                  {i < tour.step ? (
                    <motion.i initial={{ scale: 2.2, rotate: -25, opacity: 0 }} animate={{ scale: 1, rotate: -8, opacity: 1 }}>
                      ✓
                    </motion.i>
                  ) : (
                    i + 1
                  )}
                </span>
                <span>{s.ask}</span>
              </li>
            ))}
          </ol>
          <AnimatePresence mode="wait">
            {tour.note && (
              <motion.p key={tour.note} className={styles.tourNote} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                {tour.note}
              </motion.p>
            )}
          </AnimatePresence>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

"use client";

// The whole idea in ten seconds, above the fold: a word retyped in the builder
// becomes a one-line diff in issue.json; a title edited in code reaches the builder;
// the clients re-check. Loops forever.
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import styles from "./landing.module.css";

// step: 0 idle · 1 select · 2 type · 3 diff · 4 code types · 5 builder follows · 6 stamps
const DURATIONS = [1100, 900, 1300, 1900, 1500, 1500, 2200];
const NEW_WORD = "draw";
const SUFFIX = " 2.0";

export function HeroProof() {
  const [step, setStep] = useState(0);
  const [chars, setChars] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => {
      setStep((s) => (s + 1) % DURATIONS.length);
      setChars(0);
    }, DURATIONS[step]);
    return () => clearTimeout(t);
  }, [step]);

  useEffect(() => {
    if (step !== 2 && step !== 4) return;
    const total = step === 2 ? NEW_WORD.length : SUFFIX.length;
    if (chars >= total) return;
    const t = setTimeout(() => setChars((c) => c + 1), 170);
    return () => clearTimeout(t);
  }, [step, chars]);

  const edited = step >= 3 || (step === 2 && chars > 0);
  const word = step === 2 ? NEW_WORD.slice(0, chars) : step >= 3 ? NEW_WORD : "build";
  const suffix = step === 4 ? SUFFIX.slice(0, chars) : step >= 5 ? SUFFIX : "";

  return (
    <div className={styles.proof} aria-label="A headline edited in the builder becomes a one-line change in issue.json">
      <div className={styles.proofPane} data-side="builder">
        <span className={styles.proofLabel} data-tone="orange">
          Unlayer builder · marketer
        </span>
        <div className={styles.proofBlock} data-active={step >= 1 && step <= 3}>
          <span className={styles.proofKicker}>The Kestrel Dispatch</span>
          <p className={styles.proofHeadline}>
            Dashboards that{" "}
            <span className={styles.proofWord} data-selected={step === 1} data-new={edited}>
              {word}
              {step === 2 && <i className={styles.proofCaret} />}
            </span>{" "}
            themselves
          </p>
        </div>
        <div className={styles.proofFeature} data-flash={step === 5}>
          <span>01 · New</span>
          <b>Auto-boards{suffix}</b>
        </div>
      </div>

      <div className={styles.proofWire} aria-hidden>
        <AnimatePresence>
          {step === 3 && (
            <motion.span
              key="left"
              className={styles.proofSlip}
              data-dir="left"
              initial={{ x: 40, opacity: 0 }}
              animate={{ x: -40, opacity: [0, 1, 0] }}
              transition={{ duration: 0.9 }}
            >
              ← trace
            </motion.span>
          )}
          {step === 5 && (
            <motion.span
              key="right"
              className={styles.proofSlip}
              data-dir="right"
              initial={{ x: -40, opacity: 0 }}
              animate={{ x: 40, opacity: [0, 1, 0] }}
              transition={{ duration: 0.9 }}
            >
              toDesign() →
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className={styles.proofPane} data-side="code">
        <span className={styles.proofLabel} data-tone="blue">
          template/issue.json · engineer
        </span>
        <div className={styles.proofCode}>
          <div>{'"hero": {'}</div>
          {step >= 3 ? (
            <>
              <motion.div className={styles.proofDel} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                {'-  "title": "Dashboards that build themselves",'}
              </motion.div>
              <motion.div className={styles.proofAdd} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}>
                {'+  "title": "Dashboards that draw themselves",'}
              </motion.div>
            </>
          ) : (
            <div>{'   "title": "Dashboards that build themselves",'}</div>
          )}
          <div>{"},"}</div>
          <div>{'"features": [{'}</div>
          <div data-typing={step === 4}>
            {`   "title": "Auto-boards${suffix}",`}
            {step === 4 && <i className={styles.proofCaret} data-tone="blue" />}
          </div>
        </div>
        <div className={styles.proofFoot}>
          <AnimatePresence mode="wait">
            {step >= 3 && step < 6 && (
              <motion.span key="diff" className={styles.proofDiff} initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }}>
                git diff · issue.json <b>+1</b> <i>−1</i>
              </motion.span>
            )}
            {step === 6 && (
              <motion.span key="pass" className={styles.proofPass} initial={{ scale: 1.6, opacity: 0, rotate: -8 }} animate={{ scale: 1, opacity: 1, rotate: -3 }} transition={{ type: "spring", stiffness: 500, damping: 16 }}>
                9/9 email clients PASS
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

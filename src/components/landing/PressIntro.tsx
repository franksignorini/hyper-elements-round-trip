"use client";

// The first-load intro, about four seconds, once per browser: a print run.
// Crop marks draw in; the engineer's blue plate (the code) and the marketer's orange
// plate (the builder) slide in; one word is changed in the builder and flies to its
// line in the code; the plates move into register and overprint; the sheet lifts
// off and the page underneath is the site. Any click or key skips it.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "motion/react";
import { INTRO_KEY, introGate, useIntroPlaying } from "./introGate";
import styles from "./landing.module.css";

const subscribeResize = (fn: () => void) => {
  window.addEventListener("resize", fn);
  return () => window.removeEventListener("resize", fn);
};

const T = {
  marks: 0,
  plates: 0.25,
  strike: 1.2,
  fly: 1.65,
  swap: 2.15,
  register: 2.55,
  caption: 2.8,
  lift: 3.6,
};
const EASE = [0.16, 1, 0.3, 1] as const;

/** Where things sit, from the stage's center: side by side, or stacked on a narrow screen. */
function layoutFor(wide: boolean) {
  return wide
    ? { wide, blue: { x: -230, y: -10 }, orange: { x: 230, y: -10 }, word: { from: { x: 175, y: -52 }, to: { x: -205, y: 40 } } }
    : { wide, blue: { x: 0, y: -150 }, orange: { x: 0, y: 115 }, word: { from: { x: 40, y: 75 }, to: { x: 10, y: -112 } } };
}

export function PressIntro() {
  // Decided before first paint by the layout's script; ends when the run does, or on a skip.
  const playing = useIntroPlaying();
  const wide = useSyncExternalStore(subscribeResize, () => window.innerWidth > 820, () => true);
  const layout = useMemo(() => layoutFor(wide), [wide]);
  const [swapped, setSwapped] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const finish = useCallback(() => {
    timers.current.forEach(clearTimeout);
    try {
      window.localStorage.setItem(INTRO_KEY, "1");
    } catch {
      // private window: it plays again next time
    }
    document.documentElement.style.overflow = "";
    introGate.end();
  }, []);

  useEffect(() => {
    // The real decision, not the hydration-time snapshot (which says "playing" for everyone).
    if (document.documentElement.dataset.intro !== "play") return;
    document.documentElement.style.overflow = "hidden";
    timers.current = [setTimeout(() => setSwapped(true), T.swap * 1000), setTimeout(finish, T.lift * 1000)];
    window.addEventListener("keydown", finish);
    window.addEventListener("wheel", finish, { passive: true });
    return () => {
      timers.current.forEach(clearTimeout);
      window.removeEventListener("keydown", finish);
      window.removeEventListener("wheel", finish);
    };
    // Starts once: `playing` only ever goes from true to false.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AnimatePresence>
      {playing && (
        <motion.div
          className={`press-intro ${styles.press}`}
          aria-label="Round Trip: one email, two editors"
          role="img"
          onClick={finish}
          exit={{ y: "-104%", rotate: -1.5, transition: { duration: 0.75, ease: [0.7, 0, 0.84, 0] } }}
        >
          {/* Crop and registration marks, and a proof strip of the inks. */}
          <svg className={styles.pressMarks} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            {[
              "M3 9 V3 H9",
              "M91 3 H97 V9",
              "M97 91 V97 H91",
              "M9 97 H3 V91",
            ].map((d, i) => (
              <motion.path
                key={d}
                d={d}
                vectorEffect="non-scaling-stroke"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ delay: T.marks + i * 0.06, duration: 0.45, ease: EASE }}
              />
            ))}
          </svg>
          {["tl", "tr", "bl", "br"].map((corner, i) => (
            <motion.span
              key={corner}
              className={styles.regMark}
              data-corner={corner}
              initial={{ scale: 0, rotate: -90, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ delay: 0.1 + i * 0.07, type: "spring", stiffness: 300, damping: 18 }}
              aria-hidden
            />
          ))}
          <motion.div
            className={styles.proofStrip}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.5, ease: EASE }}
            aria-hidden
          >
            <i data-ink="blue" />
            <i data-ink="orange" />
            <i data-ink="over" />
            <span>ROUND TRIP · PROOF 01 · TWO INKS, ONE EMAIL</span>
          </motion.div>

          {(
            <div className={styles.pressStage}>
              {/* The engineer's plate: the template's code and its values line. */}
              <motion.div
                className={styles.platePress}
                data-ink="blue"
                initial={{ x: layout.wide ? -900 : 0, y: layout.wide ? layout.blue.y : -700, rotate: -6, opacity: 0 }}
                animate={{
                  x: [layout.wide ? -900 : 0, layout.blue.x, layout.blue.x, 10],
                  y: [layout.wide ? layout.blue.y : -700, layout.blue.y, layout.blue.y, 6],
                  rotate: [-6, -1.5, -1.5, 0],
                  opacity: [0, 1, 1, 1],
                }}
                transition={{ duration: T.register + 0.5 - T.plates, delay: T.plates, times: [0, 0.32, 0.88, 1], ease: EASE }}
              >
                <b>Engineer · Newsletter.tsx</b>
                <code>
                  <span>{"<Heading field=\"hero.title\">"}</span>
                  <span>{"  {v.hero.title}"}</span>
                  <span>{"</Heading>"}</span>
                </code>
                <code className={styles.plateValue} data-swapped={swapped || undefined}>
                  <span>&quot;title&quot;: &quot;Dashboards that </span>
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={swapped ? "draw" : "build"}
                      className={styles.plateWordSwap}
                      initial={{ y: 10, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: -10, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      {swapped ? "draw" : "build"}
                    </motion.span>
                  </AnimatePresence>
                  <span> themselves&quot;</span>
                  {swapped && (
                    <motion.em initial={{ scale: 1.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 500, damping: 16 }}>
                      +1 −1
                    </motion.em>
                  )}
                </code>
              </motion.div>

              {/* The marketer's plate: the same headline, in the builder. */}
              <motion.div
                className={styles.platePress}
                data-ink="orange"
                initial={{ x: layout.wide ? 900 : 0, y: layout.wide ? layout.orange.y : 700, rotate: 6, opacity: 0 }}
                animate={{
                  x: [layout.wide ? 900 : 0, layout.orange.x, layout.orange.x, -10],
                  y: [layout.wide ? layout.orange.y : 700, layout.orange.y, layout.orange.y, -6],
                  rotate: [6, 1.5, 1.5, 0],
                  opacity: [0, 1, 1, 1],
                }}
                transition={{ duration: T.register + 0.5 - T.plates - 0.1, delay: T.plates + 0.1, times: [0, 0.32, 0.88, 1], ease: EASE }}
              >
                <b>Marketer · Unlayer builder</b>
                <p className={styles.plateHeadline}>
                  Dashboards that{" "}
                  <span className={styles.plateEdit}>
                    build
                    <motion.i
                      className={styles.plateStrike}
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ delay: T.strike, duration: 0.28, ease: EASE }}
                    />
                    <motion.span
                      className={styles.plateDraw}
                      initial={{ opacity: 0, y: 14, rotate: -8, scale: 0.6 }}
                      animate={{ opacity: 1, y: 0, rotate: -4, scale: 1 }}
                      transition={{ delay: T.strike + 0.18, type: "spring", stiffness: 380, damping: 15 }}
                    >
                      draw
                    </motion.span>
                  </span>{" "}
                  themselves
                </p>
              </motion.div>

              {/* The word, in flight from the builder to its line in the code. */}
              <motion.span
                className={styles.pressWord}
                initial={{ x: layout.word.from.x, y: layout.word.from.y, opacity: 0, scale: 0.7 }}
                animate={{
                  x: [layout.word.from.x, (layout.word.from.x + layout.word.to.x) / 2, layout.word.to.x],
                  y: [layout.word.from.y, Math.min(layout.word.from.y, layout.word.to.y) - 130, layout.word.to.y],
                  opacity: [0, 1, 0],
                  scale: [0.7, 1.25, 0.55],
                  rotate: [-6, 4, 0],
                }}
                transition={{ delay: T.fly, duration: 0.55, times: [0, 0.5, 1], ease: [0.45, 0, 0.2, 1] }}
                aria-hidden
              >
                draw
              </motion.span>

              <motion.p
                className={styles.pressCaption}
                initial={{ opacity: 0, y: 18, letterSpacing: "0.2em" }}
                animate={{ opacity: 1, y: 0, letterSpacing: "-0.02em" }}
                transition={{ delay: T.caption, duration: 0.6, ease: EASE }}
              >
                One email. <span data-tone="blue">Two</span> <span data-tone="orange">editors.</span>
              </motion.p>
            </div>
          )}

          <motion.button
            type="button"
            className={styles.pressSkip}
            onClick={finish}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            Skip intro
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

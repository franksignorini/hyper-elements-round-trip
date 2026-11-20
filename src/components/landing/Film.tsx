"use client";

// The 30-second film: a play button for the hero, and a player that opens over the
// page. A link to /#film opens it directly (the README's poster points there).
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import styles from "./landing.module.css";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const SRC = `${base}/film/round-trip.mp4`;
const POSTER = `${base}/film/poster.jpg`;

export function Film() {
  const [open, setOpen] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    if (window.location.hash === "#film") history.replaceState(null, "", window.location.pathname + window.location.search);
    button.current?.focus();
  }, []);

  // Open from a link: /#film.
  useEffect(() => {
    const fromHash = () => window.location.hash === "#film" && setOpen(true);
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", key);
    document.documentElement.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", key);
      document.documentElement.style.overflow = "";
    };
  }, [open, close]);

  return (
    <>
      <button ref={button} type="button" className={styles.filmButton} onClick={() => setOpen(true)}>
        <span className={styles.filmPlay} aria-hidden>
          <i />
        </span>
        <span>
          Watch the film
          <small>0:30 · sound on</small>
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className={styles.filmBack}
            role="dialog"
            aria-modal="true"
            aria-label="Round Trip, the 30-second film"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
          >
            <motion.figure
              className={styles.filmFrame}
              initial={{ y: 60, rotate: -2.5, scale: 0.92 }}
              animate={{ y: 0, rotate: 0, scale: 1 }}
              exit={{ y: 30, opacity: 0, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 220, damping: 22 }}
              onClick={(e) => e.stopPropagation()}
            >
              <video
                ref={video}
                src={SRC}
                poster={POSTER}
                controls
                autoPlay
                playsInline
                preload="auto"
                onEnded={close}
              />
              <figcaption>
                <span>Round Trip · one template, two editors</span>
                <button type="button" onClick={close} className={styles.filmClose}>
                  Close <kbd>Esc</kbd>
                </button>
              </figcaption>
            </motion.figure>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

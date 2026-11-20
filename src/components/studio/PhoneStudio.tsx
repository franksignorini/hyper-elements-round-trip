"use client";

// The studio is two editors side by side, which a phone can't hold. On a narrow
// screen it becomes this: the film, the idea in three lines, and a way to open it
// on a desktop. Unlayer's builder isn't loaded at all.
import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { BEATS } from "./Guide";
import styles from "./studio.module.css";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function PhoneStudio() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className={styles.phone}>
      <header className={styles.phoneTop}>
        <Link href="/" prefetch={false} className={styles.mark}>
          <span className={styles.markBlue}>Round</span>
          <span className={styles.markOrange}>Trip</span>
        </Link>
        <span className={styles.phoneTag}>Studio</span>
      </header>

      <motion.section
        className={styles.phoneCard}
        initial={{ y: 30, rotate: -1.5, opacity: 0 }}
        animate={{ y: 0, rotate: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 22 }}
      >
        <h1>
          One email. <span data-tone="blue">Two</span> <span data-tone="orange">editors.</span>
        </h1>
        <p>
          The studio puts the code and Unlayer&rsquo;s builder side by side, so it needs a wider screen. Here it is in 30
          seconds:
        </p>
        <video src={`${base}/film/round-trip.mp4`} poster={`${base}/film/poster.jpg`} controls playsInline preload="metadata" />
      </motion.section>

      <ol className={styles.phoneBeats}>
        {BEATS.map((b, i) => (
          <motion.li
            key={b.who}
            data-tone={b.tone}
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 + i * 0.15, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          >
            <b>{b.who}</b> {b.text}
          </motion.li>
        ))}
      </ol>

      <div className={styles.phoneActions}>
        <button className={styles.introTry} onClick={copy}>
          {copied ? "Link copied: open it on a desktop" : "Copy link for desktop"}
        </button>
        <Link href="/" prefetch={false} className={styles.introWatch}>
          Back to the overview
        </Link>
      </div>
    </div>
  );
}

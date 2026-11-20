"use client";

import Link from "next/link";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { useEffect } from "react";
import { HeroProof } from "./HeroProof";
import styles from "./landing.module.css";

const ROUND = "ROUND".split("");
const TRIP = "TRIP".split("");

function Plate({ letters, tone, delay }: { letters: string[]; tone: "blue" | "orange"; delay: number }) {
  return (
    <span className={styles.plateWord} data-tone={tone} aria-hidden>
      {letters.map((l, i) => (
        <motion.span
          key={i}
          className={styles.letter}
          initial={{ y: "70%", opacity: 0, rotate: tone === "blue" ? -8 : 8 }}
          animate={{ y: 0, opacity: 1, rotate: 0 }}
          transition={{ delay: delay + i * 0.06, type: "spring", stiffness: 210, damping: 16 }}
        >
          {l}
        </motion.span>
      ))}
    </span>
  );
}

export function Hero({ blocks, bound }: { blocks: number; bound: number }) {
  // The two inks drift apart with the cursor, like a press slightly out of register.
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 80, damping: 18 });
  const sy = useSpring(my, { stiffness: 80, damping: 18 });
  const bx = useTransform(sx, (v) => v * -14);
  const by = useTransform(sy, (v) => v * -10);
  const ox = useTransform(sx, (v) => v * 14);
  const oy = useTransform(sy, (v) => v * 10);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      mx.set(e.clientX / window.innerWidth - 0.5);
      my.set(e.clientY / window.innerHeight - 0.5);
    };
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, [mx, my]);

  return (
    <section className={styles.hero}>
      <nav className={styles.nav}>
        <span className={styles.navMark}>
          <i data-tone="blue" />
          <i data-tone="orange" />
          Round Trip
        </span>
        <a href="#how">How it works</a>
        <a href="#plates">Ownership</a>
        <a href="#apis">Hyper Elements</a>
        <Link href="/studio" prefetch={false} className={styles.navCta}>
          Open the studio
        </Link>
      </nav>

      <div className={styles.heroStage}>
        <svg className={styles.orbit} viewBox="0 0 1000 420" preserveAspectRatio="none" aria-hidden>
          <defs>
            <path id="orbit-path" d="M500,20 C820,20 980,110 980,210 C980,310 820,400 500,400 C180,400 20,310 20,210 C20,110 180,20 500,20 Z" />
          </defs>
          <use href="#orbit-path" className={styles.orbitTrack} />
          <text className={styles.orbitLabel} data-tone="blue">
            <textPath href="#orbit-path" startOffset="18%">
              toDesign() → Unlayer builder
            </textPath>
          </text>
          <text className={styles.orbitLabel} data-tone="orange">
            <textPath href="#orbit-path" startOffset="66%">
              fromDesign() + trace → your JSX
            </textPath>
          </text>
          <circle r="9" className={styles.orbitDot} data-tone="blue">
            <animateMotion dur="6s" repeatCount="indefinite" rotate="auto">
              <mpath href="#orbit-path" />
            </animateMotion>
          </circle>
          <circle r="9" className={styles.orbitDot} data-tone="orange">
            <animateMotion dur="6s" begin="-3s" repeatCount="indefinite" rotate="auto">
              <mpath href="#orbit-path" />
            </animateMotion>
          </circle>
        </svg>

        <motion.p
          className={styles.heroKicker}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          A Hyper Elements newsletter template · one file, two editors
        </motion.p>
        <h1 className={styles.title}>
          <span className="sr-only">Round Trip</span>
          <motion.span className={styles.titleLine} style={{ x: bx, y: by }}>
            <Plate letters={ROUND} tone="blue" delay={0.1} />
          </motion.span>
          <motion.span className={styles.titleLine} data-second style={{ x: ox, y: oy }}>
            <Plate letters={TRIP} tone="orange" delay={0.35} />
          </motion.span>
        </h1>
      </div>

      <motion.div
        className={styles.heroCopy}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className={styles.heroLeft}>
          <p className={styles.lede}>
            Engineers keep the newsletter in <em data-tone="blue">React</em>. Marketers edit it in Unlayer&rsquo;s{" "}
            <em data-tone="orange">drag-and-drop builder</em>. Round Trip keeps them on the same file: a builder edit
            comes back as a one-line git diff, a code edit shows up in the builder, and nine email clients re-check it
            every time.
          </p>
          <div className={styles.heroActions}>
            <Link href="/studio" prefetch={false} className={styles.bigButton}>
              <span>Try it in the studio</span>
              <b aria-hidden>→</b>
            </Link>
            <a href="#how" className={styles.textLink}>
              How it works
            </a>
          </div>
          <dl className={styles.heroFacts}>
            <div>
              <dt>{blocks}</dt>
              <dd>builder blocks from one JSX file</dd>
            </div>
            <div>
              <dt>{bound}</dt>
              <dd>strings traced to template fields</dd>
            </div>
            <div>
              <dt>0</dt>
              <dd>copy-pasting between code and builder</dd>
            </div>
          </dl>
        </div>
        <HeroProof />
      </motion.div>

      <div className={styles.ticker} aria-hidden>
        <div className={styles.tickerTrack}>
          {Array.from({ length: 2 }).map((_, k) => (
            <span key={k}>
              JSX → BUILDER → JSX ✺ LOOPS STAY LOOPS ✺ COPY LANDS IN THE VALUES FILE ✺ THE TEMPLATE CHECKS EVERY EDIT ✺ LOCKED ZONES STAY LOCKED ✺ ONE-LINE
              DIFFS ✺ 9 EMAIL CLIENTS RE-CHECKED ✺ NO PROJECT ID NEEDED ✺{" "}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

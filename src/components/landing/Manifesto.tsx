"use client";

import { useRef } from "react";
import { useMotionValueEvent, useScroll } from "motion/react";
import styles from "./landing.module.css";

// Words light up as you scroll, like ink reaching the paper. Tokens in {b:…} and
// {o:…} print in the engineer's blue and the marketer's orange.
const TEXT =
  "Every email team keeps two copies of the truth. {b:Engineers} keep the template in code, with its loops and data. {o:Marketers} rebuild it in a builder, because that's where they can see it. By Friday the two disagree, and someone copies changes across by hand. {u:Round Trip keeps one copy.}";

function words() {
  const out: { text: string; tone?: string }[] = [];
  for (const part of TEXT.split(/(\{[bou]:[^}]+\})/)) {
    const m = part.match(/^\{([bou]):([^}]+)\}$/);
    if (m) for (const w of m[2].split(" ")) out.push({ text: w, tone: m[1] });
    else for (const w of part.split(" ").filter(Boolean)) out.push({ text: w });
  }
  return out;
}
const WORDS = words();

export function Manifesto() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 80%", "end 45%"] });
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    ref.current?.style.setProperty("--p", String(v));
  });
  return (
    <section className={styles.manifesto}>
      <div ref={ref} className={styles.manifestoText} style={{ ["--n" as string]: WORDS.length }}>
        {WORDS.map((w, i) => (
          <span key={i} data-tone={w.tone} style={{ ["--i" as string]: i }}>
            {w.text}{" "}
          </span>
        ))}
      </div>
    </section>
  );
}

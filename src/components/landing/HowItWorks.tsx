"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "motion/react";
import styles from "./landing.module.css";

const STEPS = [
  {
    kicker: "01 · Engineer",
    title: "Write the template once, in JSX.",
    body: "Newsletter.tsx is a Hyper Elements template(): typed, labelled fields for the copy, and a render that maps over them: one row per feature, art that swaps sides on every other row, a stats band, a roadmap list. Real code, with real logic.",
  },
  {
    kicker: "02 · toDesign()",
    title: "Hand it to the builder.",
    body: "toDesign() renders the same tree as Unlayer design JSON. Its report names what the builder can't edit: here a Layer and a custom element, which arrive as locked blocks on purpose.",
  },
  {
    kicker: "03 · Marketer",
    title: "Someone edits a headline.",
    body: "Drag, drop, retype. No ticket, no Slack thread, no copy deck in a Google Doc. The builder fires design:updated and Round Trip reads the new design.",
  },
  {
    kicker: "04 · fromDesign() + trace",
    title: "The word finds its way home.",
    body: "A second, traced render tells Round Trip which value produced every block. The edit becomes a one-line patch to the template's values file, or to the literal in Newsletter.tsx, and the template checks it first. The loop stays a loop.",
  },
  {
    kicker: "05 · Emulator",
    title: "Every client checks it again.",
    body: "The template re-renders and Hyper Elements' email client emulator re-checks it in nine clients, from classic Outlook to the Gmail app. Then the same thing works backwards: change code, the builder follows.",
  },
];

function SceneCode() {
  const lines = [
    ["k", "export default template({"],
    ["f", "  fields, // typed copy: Headline ≤ 48…"],
    ["c", "  render: (v) => // one row per feature"],
    ["hot", "  {v.features.map((feature, i) => ("],
    ["t", "    <Row key={feature.title}>"],
    ["hot2", "      {i % 2 === 0 ? [art, words] : [words, art]}"],
    ["t", "    </Row>"],
    ["t", "  ))}"],
    ["t", "  <Grid columns={3}>{v.stats.map(…)}</Grid>"],
  ];
  return (
    <div className={styles.sceneCode}>
      {lines.map(([tone, text], i) => (
        <motion.div
          key={i}
          data-tone={tone}
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.05 * i, duration: 0.4 }}
        >
          <span className={styles.lineNo}>{i + 1}</span>
          {text}
        </motion.div>
      ))}
    </div>
  );
}

const BLOCKS = [
  { w: 92, kind: "locked", label: "IssueStamp · HTML" },
  { w: 100, kind: "locked", label: "Layer · HTML" },
  { w: 40, kind: "copy", label: "kicker" },
  { w: 86, kind: "copy", label: "heading" },
  { w: 70, kind: "copy", label: "paragraph" },
  { w: 34, kind: "copy", label: "button" },
  { w: 100, kind: "row", label: "image + words" },
  { w: 100, kind: "row", label: "words + image" },
  { w: 100, kind: "row", label: "image + words" },
];

function SceneBlocks() {
  return (
    <div className={styles.sceneBuilder}>
      <div className={styles.builderChrome}>
        <i />
        <i />
        <i />
        <span>Unlayer · design.json</span>
      </div>
      {BLOCKS.map((b, i) => (
        <motion.div
          key={i}
          className={styles.sceneBlock}
          data-kind={b.kind}
          style={{ width: `${b.w}%` }}
          initial={{ opacity: 0, x: -120, rotate: -6 }}
          animate={{ opacity: 1, x: 0, rotate: 0 }}
          transition={{ delay: 0.07 * i, type: "spring", stiffness: 220, damping: 20 }}
        >
          {b.label}
          {b.kind === "locked" && <b>locked</b>}
        </motion.div>
      ))}
    </div>
  );
}

function SceneEdit() {
  return (
    <div className={styles.sceneBuilder}>
      <div className={styles.builderChrome}>
        <i />
        <i />
        <i />
        <span>Heading · selected</span>
      </div>
      <div className={styles.editBlock}>
        <span>Dashboards that </span>
        <span className={styles.strike}>build</span>
        <motion.span
          className={styles.typed}
          initial={{ width: 0 }}
          animate={{ width: "auto" }}
          transition={{ delay: 0.8, duration: 0.9, ease: "linear" }}
        >
          draw
        </motion.span>
        <span className={styles.caret} />
        <span> themselves</span>
      </div>
      <div className={styles.toolbarFake}>
        <b>B</b>
        <i>I</i>
        <u>U</u>
        <span>Georgia · 44px</span>
      </div>
    </div>
  );
}

function SceneTrace() {
  return (
    <div className={styles.sceneTrace}>
      <div className={styles.traceBlock}>heading · u_content_heading_1</div>
      <svg viewBox="0 0 300 120" className={styles.traceLine} aria-hidden>
        <motion.path
          d="M20,10 C20,70 280,40 280,110"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1, ease: "easeInOut" }}
        />
      </svg>
      <div className={styles.traceFile}>
        <div className={styles.traceHead}>template/issue.values.json</div>
        <div>{'  "kicker": "The Kestrel Dispatch",'}</div>
        <motion.div className={styles.del} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}>
          {'-  "title": "Dashboards that build themselves",'}
        </motion.div>
        <motion.div className={styles.add} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.2 }}>
          {'+  "title": "Dashboards that draw themselves",'}
        </motion.div>
        <div>{'  "intro": "This month Kestrel learned…",'}</div>
      </div>
    </div>
  );
}

const CLIENTS = ["Outlook", "Outlook.com", "Outlook Mac", "Gmail", "Gmail app", "Apple Mail", "Yahoo", "AOL", "Gmail other"];

function SceneStamps() {
  return (
    <div className={styles.sceneStamps}>
      {CLIENTS.map((c, i) => (
        <motion.div
          key={c}
          className={styles.miniStamp}
          initial={{ scale: 2, opacity: 0, rotate: -20 }}
          animate={{ scale: 1, opacity: 1, rotate: ((i * 7) % 11) - 5 }}
          transition={{ delay: 0.12 * i, type: "spring", stiffness: 500, damping: 16 }}
        >
          <b>PASS</b>
          <span>{c}</span>
        </motion.div>
      ))}
    </div>
  );
}

const SCENES = [SceneCode, SceneBlocks, SceneEdit, SceneTrace, SceneStamps];

export function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    setStep(Math.min(STEPS.length - 1, Math.max(0, Math.floor(v * STEPS.length))));
  });
  const Scene = SCENES[step];

  return (
    <section id="how" ref={ref} className={styles.how} style={{ height: `${STEPS.length * 70 + 40}vh` }}>
      <div className={styles.howSticky}>
        <div className={styles.howText}>
          <p className={styles.sectionKicker}>How it works</p>
          <div className={styles.howSteps}>
            {STEPS.map((s, i) => (
              <motion.div
                key={s.kicker}
                className={styles.howStep}
                animate={{ opacity: i === step ? 1 : 0.18, x: i === step ? 0 : -8 }}
                transition={{ duration: 0.4 }}
              >
                <span data-tone={i % 2 ? "orange" : "blue"}>{s.kicker}</span>
                <h3>{s.title}</h3>
                <AnimatePresence initial={false}>
                  {i === step && (
                    <motion.p
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                    >
                      {s.body}
                    </motion.p>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
          <div className={styles.progress}>
            <motion.i style={{ scaleY: scrollYProgress }} />
          </div>
        </div>
        <div className={styles.howScene}>
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              className={styles.sceneWrap}
              initial={{ opacity: 0, y: 30, rotate: 1.5 }}
              animate={{ opacity: 1, y: 0, rotate: 0 }}
              exit={{ opacity: 0, y: -30, rotate: -1.5 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            >
              <Scene />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

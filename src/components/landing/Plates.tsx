"use client";

// The real email, rendered by Hyper Elements, separated like a riso print into
// its plates: the orange plate is copy from issue.json, the blue plate is what
// code owns (locked blocks and words written in the JSX). Rects are measured in
// the rendered HTML, so the plates match the email exactly.
import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { motion, useScroll, useSpring, useTransform } from "motion/react";
import type { OwnedBlock } from "@/lib/landing-data";
import styles from "./landing.module.css";

interface Rect {
  id: string;
  owner: OwnedBlock["owner"];
  label: string;
  path?: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const CROP = 1460;
const noop = () => () => {};
const SCALE = 0.56;

const norm = (s: string) => s.replace(/\s+/g, " ").replace(/ /g, " ").trim();

function measure(doc: Document, owned: OwnedBlock[]): Rect[] {
  const rects: Rect[] = [];
  const all = Array.from(doc.body.querySelectorAll<HTMLElement>("p,h1,h2,h3,h4,h5,h6,a,td,li,ol,ul,span"));
  const place = (el: Element, o: OwnedBlock, pad = 0) => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    rects.push({
      id: o.id,
      owner: o.owner,
      label: o.label,
      path: o.paths[0],
      x: r.left - pad,
      y: r.top - pad,
      w: r.width + pad * 2,
      h: r.height + pad * 2,
    });
  };
  for (const o of owned) {
    if (o.type === "html") {
      const el =
        o.label.startsWith("Layer") ? doc.querySelector("td[background]") : Array.from(doc.querySelectorAll("p")).find((p) => /NO\.\s*\d+/.test(p.textContent ?? ""))?.closest("td");
      if (el) place(el, o, 2);
      continue;
    }
    if (o.src) {
      const file = o.src.split("/").pop() ?? "";
      const img = Array.from(doc.images).find((i) => i.src.endsWith(file));
      if (img) place(img, o, 4);
      continue;
    }
    if (!o.text) continue;
    const want = norm(o.text);
    const hits = all.filter((el) => norm(el.innerText || el.textContent || "") === want);
    // The deepest element with exactly this text is the block itself.
    const best = hits.find((h) => !hits.some((other) => other !== h && h.contains(other))) ?? hits[0];
    if (best) place(best, o, 6);
  }
  return rects;
}

export function Plates({ html, owned, token }: { html: string; owned: OwnedBlock[]; token: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const section = useRef<HTMLElement>(null);
  const [rects, setRects] = useState<Rect[]>([]);
  const [height, setHeight] = useState(2400);
  // The server rendered with a stand-in origin: point the art at this site.
  // (No origin on the server, so the iframe only exists in the browser.)
  const origin = useSyncExternalStore(
    noop,
    // Under GitHub Pages the site lives below a base path (/repo-name).
    () => window.location.origin + (process.env.NEXT_PUBLIC_BASE_PATH ?? ""),
    () => null,
  );
  const srcDoc = useMemo(() => (origin ? html.replaceAll(token, origin) : null), [html, token, origin]);

  const onLoad = () => {
    const doc = frame.current?.contentDocument;
    if (!doc) return;
    const run = () => {
      // The top of the email (masthead to the feature rows) tells the story;
      // the rest would only run off the page once tilted.
      const crop = Math.min(CROP, doc.documentElement.scrollHeight);
      setHeight(crop);
      setRects(measure(doc, owned).filter((r) => r.y + r.h <= crop));
    };
    run();
    // Again once the art has loaded and moved things.
    Promise.all(Array.from(doc.images).map((i) => (i.complete ? null : new Promise((r) => (i.onload = i.onerror = r))))).then(run);
  };

  const { scrollYProgress } = useScroll({ target: section, offset: ["start end", "end end"] });
  const p = useSpring(useTransform(scrollYProgress, [0.15, 0.75], [0, 1], { clamp: true }), { stiffness: 90, damping: 22 });
  const rotateX = useTransform(p, [0, 1], [0, 58]);
  const rotateZ = useTransform(p, [0, 1], [0, -24]);
  const lift1 = useTransform(p, [0, 1], [0, 90]);
  const lift2 = useTransform(p, [0, 1], [0, 180]);
  const labels = useTransform(p, [0.6, 1], [0, 1]);
  const y = useTransform(p, [0, 1], [0, 40]);
  const x = useTransform(p, [0, 1], [0, -40]);

  const counts = useMemo(() => {
    const c = { copy: 0, code: 0, locked: 0 };
    for (const o of owned) {
      if (o.owner === "copy") c.copy++;
      else if (o.owner === "locked") c.locked++;
      else if (o.owner === "code-text") c.code++;
    }
    return c;
  }, [owned]);

  return (
    <section id="plates" ref={section} className={styles.plates}>
      <div className={styles.platesSticky}>
        <div className={styles.platesIntro}>
          <p className={styles.sectionKicker}>The ownership map</p>
          <h2>
            One email, <em data-tone="orange">two plates.</em>
          </h2>
          <p>
            Scroll to pull the print apart. Orange is copy that lives in <code>issue.json</code> ({counts.copy} blocks): the
            marketer&rsquo;s. Blue is what code owns: {counts.locked} locked blocks from <code>toDesign()</code>&rsquo;s
            report, and {counts.code} lines written in the JSX. Measured from the HTML that <code>render()</code> just
            produced.
          </p>
          <ul className={styles.plateLegend}>
            <li data-owner="copy">Copy · issue.json</li>
            <li data-owner="code-text">Code text · Newsletter.tsx</li>
            <li data-owner="locked">Locked · HTML block</li>
          </ul>
        </div>
        <div className={styles.platesStage}>
          <motion.div className={styles.stack} style={{ rotateX, rotateZ, x, y, height: height * SCALE, width: 600 * SCALE }}>
            <div className={styles.scaler} style={{ transform: `scale(${SCALE})` }}>
            <div className={styles.paperPlate} style={{ height }}>
              {srcDoc && (
                <iframe
                  ref={frame}
                  srcDoc={srcDoc}
                  onLoad={onLoad}
                  title="The Kestrel Dispatch, rendered by Hyper Elements"
                  className={styles.emailFrame}
                  style={{ height }}
                  scrolling="no"
                  tabIndex={-1}
                />
              )}
            </div>
            <motion.div className={styles.inkPlate} data-plate="orange" style={{ z: lift1, height }}>
              {rects
                .filter((r) => r.owner === "copy")
                .map((r) => (
                  <span key={r.id} className={styles.zone} data-owner={r.owner} style={{ left: r.x, top: r.y, width: r.w, height: r.h }}>
                    <motion.em style={{ opacity: labels }}>{r.path}</motion.em>
                  </span>
                ))}
              <motion.b className={styles.plateTag} style={{ opacity: labels }}>
                ORANGE PLATE · COPY
              </motion.b>
            </motion.div>
            <motion.div className={styles.inkPlate} data-plate="blue" style={{ z: lift2, height }}>
              {rects
                .filter((r) => r.owner !== "copy" && r.owner !== "fixed")
                .map((r) => (
                  <span key={r.id} className={styles.zone} data-owner={r.owner} style={{ left: r.x, top: r.y, width: r.w, height: r.h }}>
                    <motion.em style={{ opacity: labels }}>{r.owner === "locked" ? r.label : "Newsletter.tsx"}</motion.em>
                  </span>
                ))}
              <motion.b className={styles.plateTag} style={{ opacity: labels }}>
                BLUE PLATE · CODE
              </motion.b>
            </motion.div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

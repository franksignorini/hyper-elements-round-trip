"use client";

import { useMemo } from "react";
import { createTwoFilesPatch, structuredPatch } from "diff";
import { motion } from "motion/react";
import styles from "./studio.module.css";

interface Props {
  head: Record<string, string>;
  files: Record<string, string>;
}

export function gitPatch(head: Record<string, string>, files: Record<string, string>): string {
  return Object.keys(files)
    .filter((f) => head[f] !== files[f])
    .map((f) => {
      const body = createTwoFilesPatch(`a/template/${f}`, `b/template/${f}`, head[f], files[f], "", "", { context: 3 });
      return `diff --git a/template/${f} b/template/${f}\n${body.split("\n").slice(1).join("\n")}`;
    })
    .join("");
}

export function DiffView({ head, files }: Props) {
  const patches = useMemo(
    () =>
      Object.keys(files)
        .filter((f) => head[f] !== files[f])
        .map((f) => {
          const p = structuredPatch(f, f, head[f], files[f], "", "", { context: 2 });
          let add = 0;
          let del = 0;
          for (const h of p.hunks)
            for (const l of h.lines) {
              if (l[0] === "+") add++;
              else if (l[0] === "-") del++;
            }
          return { file: f, hunks: p.hunks, add, del };
        }),
    [head, files],
  );

  if (!patches.length) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyBig}>Working tree clean.</p>
        <p>Edit a headline in the builder, or a line of JSX on the left. The diff against the committed template shows up here.</p>
      </div>
    );
  }

  const download = () => {
    const blob = new Blob([gitPatch(head, files)], { type: "text/x-diff" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "round-trip.patch";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div className={styles.diff}>
      <div className={styles.diffStat}>
        <code>git diff --stat</code>
        {patches.map((p) => (
          <span key={p.file} className={styles.statRow}>
            <span>template/{p.file}</span>
            <span className={styles.statBar}>
              <b style={{ width: `${Math.min(100, p.add * 6)}px` }} />
              <i style={{ width: `${Math.min(100, p.del * 6)}px` }} />
            </span>
            <span className="mono">
              +{p.add} −{p.del}
            </span>
          </span>
        ))}
        <button className={styles.ghostButton} onClick={download}>
          Download .patch
        </button>
      </div>
      {patches.map((p) => (
        <div key={p.file} className={styles.diffFile}>
          <div className={styles.diffFileHead}>
            <span className="mono">template/{p.file}</span>
          </div>
          {p.hunks.map((h, hi) => {
            let oldN = h.oldStart;
            let newN = h.newStart;
            return (
              <div key={hi} className={styles.hunk}>
                <div className={styles.hunkHead}>
                  @@ −{h.oldStart},{h.oldLines} +{h.newStart},{h.newLines} @@
                </div>
                {h.lines.map((line, li) => {
                  const sign = line[0];
                  const a = sign === "+" ? "" : oldN++;
                  const b = sign === "-" ? "" : newN++;
                  return (
                    <motion.div
                      key={`${li}-${line}`}
                      className={styles.diffLine}
                      data-sign={sign === "+" ? "add" : sign === "-" ? "del" : "ctx"}
                      initial={sign === " " ? false : { opacity: 0, x: sign === "+" ? 14 : -14 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: li * 0.025, duration: 0.35 }}
                    >
                      <span className={styles.ln}>{a}</span>
                      <span className={styles.ln}>{b}</span>
                      <span className={styles.lineText}>{line}</span>
                    </motion.div>
                  );
                })}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

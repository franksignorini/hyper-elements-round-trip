"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { CLIENTS, previewIn, STATIC_SITE, type CheckResult, type ClientId } from "@/lib/rt/checks";
import styles from "./studio.module.css";

interface Props {
  result: CheckResult | null;
  running: boolean;
  runKey: number;
}

const tilt = (i: number) => ((i * 37) % 11) - 5;

export function ClientStamps({ result, running, runKey }: Props) {
  const [preview, setPreview] = useState<{ id: ClientId; html: string | null; error?: string; loading: boolean } | null>(null);

  const open = async (id: ClientId) => {
    if (!result) return;
    setPreview({ id, html: null, loading: true });
    try {
      const html = await previewIn(result.html, id, result.ctx);
      setPreview((p) => (p && p.id === id ? { id, html, loading: false } : p));
    } catch (e) {
      const error = e instanceof Error ? e.message : "The preview failed.";
      setPreview((p) => (p && p.id === id ? { id, html: null, error, loading: false } : p));
    }
  };

  const passing = result?.clients.filter((c) => c.errors === 0).length ?? 0;

  return (
    <div className={styles.clients}>
      <div className={styles.clientsHead}>
        <p>
          {result ? (
            <>
              <strong>
                {passing}/{CLIENTS.length} clients pass
              </strong>{" "}
              · {(result.bytes / 1024).toFixed(1)} KB of HTML (Gmail clips at 102 KB) · checked in {result.ms} ms
            </>
          ) : (
            "Rendering the template and asking the emulator…"
          )}
        </p>
        {result?.baked === "fresh" ? (
          <p className={styles.dim}>
            Checked by the emulator (<code>emailClients()</code>, <code>renderInEmailClients()</code>) when this site was
            built: a static host has no server to run it on each trip. Click a stamp to see the email as that client draws it.
          </p>
        ) : result?.baked === "stale" ? (
          <p className={styles.staticNote}>
            These verdicts and previews are for the committed template, checked when this site was built. Your edits are
            checked by <code>validate()</code> in your browser; run the studio locally (<code>npm run dev</code>) and the
            emulator re-checks every trip.
          </p>
        ) : result && !result.emulator ? (
          <p className={styles.staticNote}>
            This static demo checks the email with <code>validate()</code> in your browser. The per-client emulator (
            <code>emailClients()</code>, <code>renderInEmailClients()</code>) runs on Node: clone the repo and run{" "}
            <code>npm run dev</code> to see each client’s verdict and preview.
          </p>
        ) : (
          <p className={styles.dim}>
            <code>validate(template, {"{ plugins: [emailClients()] }"})</code> runs after every trip. Click a stamp to
            see the email as that client draws it (<code>renderInEmailClients</code>).
          </p>
        )}
      </div>
      <div className={styles.stamps}>
        {CLIENTS.map((c, i) => {
          const r = result?.clients.find((x) => x.id === c.id);
          const state = !r ? "wait" : r.errors ? "fail" : r.warnings ? "warn" : "pass";
          return (
            <motion.button
              key={`${c.id}-${runKey}`}
              className={styles.stamp}
              data-state={running ? "wait" : state}
              disabled={!c.preview || !result}
              onClick={() => open(c.id)}
              initial={{ scale: 1.6, opacity: 0, rotate: tilt(i) - 12 }}
              animate={{ scale: 1, opacity: 1, rotate: tilt(i) }}
              transition={{ type: "spring", stiffness: 520, damping: 18, delay: i * 0.06 }}
              title={r?.messages.join("\n") || undefined}
            >
              <span className={styles.stampRing}>
                <span className={styles.stampVerdict}>{running ? "…" : state === "fail" ? "FAIL" : "PASS"}</span>
                <span className={styles.stampName}>{c.name}</span>
                <span className={styles.stampSub}>{c.sub}</span>
                {r && (r.notes > 0 || r.warnings > 0) && (
                  <span className={styles.stampNotes}>
                    {r.warnings ? `${r.warnings} warn · ` : ""}
                    {r.notes} notes
                  </span>
                )}
              </span>
            </motion.button>
          );
        })}
      </div>
      {/* Portal: the dock is animated, and a transformed ancestor would trap position: fixed. */}
      {typeof document !== "undefined" &&
        createPortal(
      <AnimatePresence>
        {preview && (
          <motion.div
            className={styles.modalBack}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPreview(null)}
          >
            <motion.div
              className={styles.modal}
              initial={{ y: 60, rotate: -2, opacity: 0 }}
              animate={{ y: 0, rotate: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 26 }}
              onClick={(e) => e.stopPropagation()}
            >
              <header className={styles.modalHead}>
                <strong>{CLIENTS.find((c) => c.id === preview.id)?.name}</strong>
                <span className={styles.dim}>
                  {CLIENTS.find((c) => c.id === preview.id)?.sub} ·{" "}
                  {STATIC_SITE ? "emulated when the site was built, committed template" : "emulated locally"}
                </span>
                <button className={styles.ghostButton} onClick={() => setPreview(null)}>
                  Close
                </button>
              </header>
              {preview.loading ? (
                <div className={styles.modalLoading}>Drawing the email the way this client would…</div>
              ) : preview.html ? (
                <iframe className={styles.previewFrame} srcDoc={preview.html} title="Email client preview" sandbox="allow-scripts allow-same-origin" />
              ) : (
                <div className={styles.modalLoading}>
                  <div className={styles.previewError}>
                    <p>{preview.error ?? "The preview failed."}</p>
                    {!STATIC_SITE && (
                      <button className={styles.ghostButton} onClick={() => open(preview.id)}>
                        Try again
                      </button>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}

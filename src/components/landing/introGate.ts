"use client";

// Whether the first-load intro is still playing, so the hero's entrance waits for it.
// The layout's pre-paint script decides first (see introScript.ts).
import { useSyncExternalStore } from "react";

export { INTRO_KEY } from "./introScript";

const listeners = new Set<() => void>();
let ended = false;

const playing = () => !ended && typeof document !== "undefined" && document.documentElement.dataset.intro === "play";

export const introGate = {
  end() {
    if (ended) return;
    ended = true;
    if (typeof document !== "undefined") document.documentElement.dataset.intro = "skip";
    listeners.forEach((fn) => fn());
  },
};

/** True while the intro covers the page. The server renders the page as if it plays. */
export function useIntroPlaying(): boolean {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    playing,
    () => true,
  );
}

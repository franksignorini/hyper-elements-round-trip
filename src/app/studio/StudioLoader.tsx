"use client";

import dynamic from "next/dynamic";

// The studio compiles, renders and traces templates in the browser: no server render.
const Studio = dynamic(() => import("@/components/studio/Studio"), {
  ssr: false,
  loading: () => (
    <div style={{ height: "100vh", display: "grid", placeItems: "center", fontWeight: 700, letterSpacing: "-0.02em" }}>
      <span>
        <span style={{ color: "var(--blue)" }}>Round</span>
        <span style={{ color: "var(--orange)" }}>Trip</span> · warming up the press…
      </span>
    </div>
  ),
});

export function StudioLoader() {
  return <Studio />;
}

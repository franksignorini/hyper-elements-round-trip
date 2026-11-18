// Draws the newsletter's illustrations with Hyper Elements' own Canvas renderer:
// riso-style two-ink shapes, no stock photos. Run: npm run art
import { mkdir, writeFile } from "node:fs/promises";
import { Canvas, Circle, Line, Path, Polygon, Rect, Svg } from "@hyper-elements/react";
import { renderImage } from "@hyper-elements/react/image";
import type { ReactElement } from "react";

const PAPER = "#efe9dd";
const CREAM = "#fbf8f2";
const INK = "#1d1b17";
const BLUE = "#2b45ff";
const ORANGE = "#ff5a2c";

/** A field of halftone dots that shrink from one edge to the other. */
function halftone(x0: number, y0: number, w: number, h: number, step: number, color: string, opacity = 1) {
  const dots: ReactElement[] = [];
  for (let y = y0; y < y0 + h; y += step) {
    for (let x = x0; x < x0 + w; x += step) {
      const t = (x - x0) / w;
      const r = Math.max(0.6, (step / 2.2) * (1 - t));
      dots.push(<Circle key={`${x}-${y}`} cx={x} cy={y} r={r} style={{ fill: color, opacity }} />);
    }
  }
  return dots;
}

function cover() {
  return (
    <Canvas width={1200} height={560} style={{ backgroundColor: BLUE }}>
      <Svg width={1200} height={560} viewBox="0 0 1200 560">
        {halftone(0, 10, 700, 560, 22, CREAM, 0.35)}
        <Circle cx={330} cy={300} r={210} style={{ fill: ORANGE }} />
        <Circle cx={346} cy={288} r={210} style={{ fill: "transparent", stroke: INK, strokeWidth: 3, opacity: 0.5 }} />
        <Polygon points="120,420 520,250 600,300 230,470" style={{ fill: INK, opacity: 0.92 }} />
        <Polygon points="380,300 560,180 640,215 470,330" style={{ fill: INK, opacity: 0.92 }} />
        <Polygon points="560,180 700,150 640,215" style={{ fill: INK }} />
        <Line x1={0} y1={520} x2={1200} y2={520} style={{ stroke: CREAM, strokeWidth: 2, opacity: 0.6 }} />
        <Rect x={760} y={60} width={380} height={6} style={{ fill: ORANGE }} />
      </Svg>
    </Canvas>
  );
}

function boards() {
  const bars = [300, 420, 250, 520, 380];
  return (
    <Canvas width={960} height={720} style={{ backgroundColor: PAPER }}>
      <Svg width={960} height={720} viewBox="0 0 960 720">
        {halftone(560, 40, 380, 300, 20, BLUE, 0.5)}
        {bars.map((h, i) => (
          <Rect key={`b${i}`} x={120 + i * 150} y={620 - h} width={96} height={h} rx={10} style={{ fill: i % 2 ? BLUE : ORANGE, opacity: 0.92 }} />
        ))}
        {bars.map((h, i) => (
          <Rect key={`o${i}`} x={132 + i * 150} y={608 - h} width={96} height={h} rx={10} style={{ fill: "transparent", stroke: INK, strokeWidth: 3 }} />
        ))}
        <Line x1={80} y1={622} x2={880} y2={622} style={{ stroke: INK, strokeWidth: 5 }} />
        <Path d="M120 330 C 260 260, 360 420, 500 300 S 760 140, 860 200" style={{ fill: "transparent", stroke: INK, strokeWidth: 6 }} />
      </Svg>
    </Canvas>
  );
}

function alerts() {
  return (
    <Canvas width={960} height={720} style={{ backgroundColor: PAPER }}>
      <Svg width={960} height={720} viewBox="0 0 960 720">
        {[300, 230, 160, 90].map((r, i) => (
          <Circle key={r} cx={480} cy={360} r={r} style={{ fill: i === 3 ? ORANGE : "transparent", stroke: ORANGE, strokeWidth: 8, opacity: 0.35 + i * 0.2 }} />
        ))}
        <Path
          d="M40 420 L 180 420 L 220 330 L 270 500 L 320 380 L 360 420 L 600 420 L 640 380 L 680 440 L 720 420 L 920 420"
          style={{ fill: "transparent", stroke: BLUE, strokeWidth: 12 }}
        />
        <Circle cx={480} cy={360} r={26} style={{ fill: INK }} />
        {halftone(40, 560, 880, 140, 22, INK, 0.25)}
      </Svg>
    </Canvas>
  );
}

function lenses() {
  return (
    <Canvas width={960} height={720} style={{ backgroundColor: PAPER }}>
      <Svg width={960} height={720} viewBox="0 0 960 720">
        {halftone(60, 60, 840, 600, 26, INK, 0.12)}
        <Circle cx={380} cy={360} r={230} style={{ fill: BLUE, opacity: 0.9 }} />
        <Circle cx={580} cy={360} r={230} style={{ fill: ORANGE, opacity: 0.8 }} />
        <Circle cx={380} cy={360} r={230} style={{ fill: "transparent", stroke: INK, strokeWidth: 4 }} />
        <Circle cx={580} cy={360} r={230} style={{ fill: "transparent", stroke: INK, strokeWidth: 4 }} />
        <Line x1={480} y1={150} x2={480} y2={570} style={{ stroke: CREAM, strokeWidth: 6 }} />
      </Svg>
    </Canvas>
  );
}

const jobs: Record<string, () => ReactElement> = {
  "cover.png": cover,
  "feature-boards.png": boards,
  "feature-alerts.png": alerts,
  "feature-lenses.png": lenses,
};

await mkdir("public/art", { recursive: true });
for (const [file, draw] of Object.entries(jobs)) {
  const { image, width, height, diagnostics } = await renderImage(draw(), { fonts: [] });
  await writeFile(`public/art/${file}`, image);
  console.log(`public/art/${file} ${width}x${height} ${image.length} bytes`, diagnostics.length ? diagnostics : "");
}

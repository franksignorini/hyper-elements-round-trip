// Captures the README's screenshots and the round-trip GIF from a running server.
//   npm run build && npm start -- -p 3100   (in another terminal)
//   node scripts/capture.mjs http://localhost:3100
// Needs Chrome or Edge, and ffmpeg on PATH for the GIF.
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:3100";
const browsers = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
];
const executablePath = browsers.find((p) => existsSync(p));
if (!executablePath) throw new Error("No Chrome or Edge found");

mkdirSync("docs/media", { recursive: true });
const browser = await chromium.launch({
  executablePath,
  headless: true,
  // The builder runs on https; let it show our http://localhost art while capturing.
  args: [
    "--allow-running-insecure-content",
    "--disable-features=AutoupgradeMixedContent,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights,PrivateNetworkAccessRespectPreflightResults,LocalNetworkAccessChecks",
  ],
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- landing ----
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
  await page.goto(base, { waitUntil: "networkidle" });
  // Catch the hero's proof loop on the step where the diff has landed.
  await wait(5600);
  await page.screenshot({ path: "docs/media/hero.png" });
  const plates = await page.$("#plates");
  const box = await plates.boundingBox();
  const top = await page.evaluate(() => scrollY);
  await page.evaluate((y) => scrollTo(0, y), top + box.y + box.height * 0.62);
  await wait(2500);
  await page.screenshot({ path: "docs/media/plates.png" });
  const how = await page.$("#how");
  const hb = await how.boundingBox();
  const now = await page.evaluate(() => scrollY);
  await page.evaluate((y) => scrollTo(0, y), now + hb.y + hb.height * 0.62);
  await wait(1800);
  await page.screenshot({ path: "docs/media/how.png" });
  await page.close();
}

// ---- studio, recorded with Chrome's screencast ----
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
rmSync("docs/media/raw", { recursive: true, force: true });
mkdirSync("docs/media/raw", { recursive: true });
const frames = [];
const cdp = await context.newCDPSession(page);
cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
  const file = `docs/media/raw/${String(frames.length).padStart(5, "0")}.jpg`;
  writeFileSync(file, Buffer.from(data, "base64"));
  frames.push({ file, t: metadata.timestamp });
  await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
});
await page.goto(`${base}/studio`, { waitUntil: "networkidle" });
// The moving paper grain changes every pixel of every frame: hide it so the GIF compresses.
await page.addStyleTag({ content: ".grain{display:none!important}" });
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 85, maxWidth: 1440, maxHeight: 900, everyNthFrame: 1 });
const builder = page.frameLocator("#rt-builder iframe");
await builder.getByText("Dashboards that build themselves").first().waitFor({ timeout: 30000 });
await wait(2500);
await page.getByRole("button", { name: "Got it" }).click();
await wait(600);

// Marketer: retype a word in the headline.
// The builder draws a selection layer over its blocks, so click like a person.
const heading = builder.getByText("Dashboards that build themselves").first();
await heading.scrollIntoViewIfNeeded();
await wait(700);
const hb = await heading.boundingBox();
await page.mouse.click(hb.x + hb.width * 0.5, hb.y + hb.height * 0.5);
await wait(1100);
const hb2 = await heading.boundingBox();
await page.mouse.click(hb2.x + 20, hb2.y + hb2.height * 0.3);
await wait(500);
// Select exactly the word "build", as a precise double-click would.
await heading.evaluate((el) => {
  const root = el.closest("[contenteditable]") ?? el;
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const at = node.textContent.indexOf("build");
    if (at < 0) continue;
    const range = root.ownerDocument.createRange();
    range.setStart(node, at);
    range.setEnd(node, at + 5);
    const selection = root.ownerDocument.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    return;
  }
});
await wait(600);
await page.keyboard.type("draw", { delay: 180 });
await wait(2600);
await page.screenshot({ path: "docs/media/studio-pull.png" });
await page.getByRole("tab", { name: /Git diff/ }).click();
await wait(2200);
await page.screenshot({ path: "docs/media/studio-diff.png" });

// Engineer: edit a feature title in issue.values.json, watch the builder follow.
await page.getByRole("tab", { name: "issue.values.json" }).click();
await wait(500);
const line = page.locator(".cm-line", { hasText: '"title": "Auto-boards"' }).first();
await line.scrollIntoViewIfNeeded();
await line.click();
await page.keyboard.press("End");
await page.keyboard.press("ArrowLeft");
await page.keyboard.press("ArrowLeft");
await page.keyboard.type(" 2.0", { delay: 160 });
await wait(1800);
await builder.getByText("Auto-boards 2.0").first().scrollIntoViewIfNeeded().catch(() => {});
await wait(1800);
await page.getByRole("tab", { name: /Trips/ }).click();
await wait(1500);
await page.screenshot({ path: "docs/media/studio-push.png" });
await page.getByRole("tab", { name: /Email clients/ }).click();
await wait(2600);
await page.screenshot({ path: "docs/media/studio-clients.png" });
await page.getByRole("tab", { name: /Ownership/ }).click();
await wait(1800);
await page.screenshot({ path: "docs/media/studio-ownership.png" });
// Click a block: the code panel jumps to the line it comes from.
await page.locator("button[class*=blockChip]", { hasText: "Quiet alerts" }).first().hover();
await wait(400);
await page.locator("button[class*=blockChip]", { hasText: "Quiet alerts" }).first().click();
await wait(1200);
await page.screenshot({ path: "docs/media/studio-jump.png" });

// A broken edit names its file and line, and the builder keeps the last good design.
await page.getByRole("tab", { name: "issue.values.json" }).click();
const dateLine = page.locator(".cm-line", { hasText: '"date": "November 2026",' }).first();
await dateLine.scrollIntoViewIfNeeded();
await dateLine.click();
await page.keyboard.press("End");
await page.keyboard.press("Backspace");
await wait(1600);
await page.screenshot({ path: "docs/media/studio-error.png" });
await page.keyboard.type(",");
await wait(1600);

// The change request: diff, checks, the email before and after.
await page.getByRole("button", { name: /Review changes/ }).click();
await wait(3200);
await page.screenshot({ path: "docs/media/studio-review.png" });
await page.getByText("Spot the difference").click();
await wait(2200);
await page.screenshot({ path: "docs/media/studio-spot.png" });
await page.getByRole("button", { name: /Approve & merge/ }).click();
await wait(700);
await page.screenshot({ path: "docs/media/studio-merged.png" });
await wait(1800);
await cdp.send("Page.stopScreencast").catch(() => {});
await context.close();
await browser.close();

// ---- GIF: frames at their real timing, through ffmpeg ----
if (frames.length > 1) {
  const lines = ["ffconcat version 1.0"];
  frames.forEach((f, i) => {
    const next = frames[i + 1];
    const dur = next ? Math.max(0.02, next.t - f.t) : 1.5;
    lines.push(`file '${f.file.replace("docs/media/raw/", "")}'`, `duration ${dur.toFixed(3)}`);
  });
  lines.push(`file '${frames.at(-1).file.replace("docs/media/raw/", "")}'`);
  writeFileSync("docs/media/raw/frames.txt", lines.join("\n"));
  try {
    execFileSync(
      "ffmpeg",
      ["-y", "-f", "concat", "-safe", "0", "-i", "docs/media/raw/frames.txt", "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-crf", "22", "docs/media/round-trip.mp4"],
      { stdio: "inherit" },
    );
    // README GIF: 1.6x speed, 8 fps, 880px wide, so it stays a few MB.
    execFileSync(
      "ffmpeg",
      [
        "-y", "-i", "docs/media/round-trip.mp4",
        "-vf", "setpts=PTS/1.6,fps=8,scale=880:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle",
        "docs/media/round-trip.gif",
      ],
      { stdio: "inherit" },
    );
    rmSync("docs/media/raw", { recursive: true, force: true });
  } catch {
    console.warn("ffmpeg failed or is missing: frames kept in docs/media/raw");
  }
}
console.log(`captured docs/media/* (${frames.length} frames)`);

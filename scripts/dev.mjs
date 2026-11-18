// npm run dev: keep src/generated/sources.ts in step with template/, and run Next.
import { spawn } from "node:child_process";

const embed = spawn(process.execPath, ["scripts/embed-sources.mjs", "--watch"], { stdio: "inherit" });
const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", ...process.argv.slice(2)], {
  stdio: "inherit",
});
const stop = () => {
  embed.kill();
  next.kill();
};
next.on("exit", (code) => {
  embed.kill();
  process.exit(code ?? 0);
});
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

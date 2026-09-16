import { cp, mkdir, writeFile } from "node:fs/promises";
import { configuredPort, multiplayerUrl } from "@cardgame/multiplayer/config.js";

const serverOrigin = multiplayerUrl(process.env);
const output = process.env.DEV_PREVIEW_PORT
  ? `.cache/dev-preview/${configuredPort(process.env.DEV_PREVIEW_PORT, 4175)}`
  : "demo";

const result = await Bun.build({
  entrypoints: ["src/index.ts"],
  outdir: output,
  target: "browser",
  minify: false,
});
if (!result.success) throw new Error(result.logs.map((log) => log.message).join("\n"));
await mkdir(output, { recursive: true });
await cp("src/assets", `${output}/assets`, { recursive: true });
await writeFile(
  `${output}/index.html`,
  `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Card game · Lit</title><style>body{margin:2rem auto;padding:0 1rem;max-width:64rem;font-family:system-ui,sans-serif}h1{font-size:1.5rem}</style>
<script type="module" src="./index.js"></script></head><body><h1>Card game</h1><card-game multiplayer-url="${serverOrigin}"></card-game>
<noscript>Enable JavaScript to play this local card game.</noscript></body></html>\n`,
);

// Development/test file server only; deploy the generated demo/ directory as static files.
import { resolve, sep } from "node:path";
import { watch, type FSWatcher } from "node:fs";
import { startDevelopmentServer } from "@dev/dev-server.js";
import { configuredPort } from "@cardgame/multiplayer/config.js";

const root = resolve(import.meta.dirname, "..");
const port = configuredPort(process.env.PORT, 4175);
const development = process.argv.includes("--dev");
const demo = resolve(root, development ? `.cache/dev-preview/${port}` : "demo");
const backend = development
  ? await startDevelopmentServer({
      directory: root,
      env: process.env,
      origins: [`http://127.0.0.1:${port}`, `http://localhost:${port}`],
    })
  : undefined;
let watcher: FSWatcher | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let building: Promise<void> | undefined;
let dirty = false;
async function rebuild(): Promise<void> {
  dirty = true;
  if (building) return building;
  building = (async () => {
    while (dirty) {
      dirty = false;
      const child = Bun.spawn([process.execPath, "scripts/build-demo.ts"], {
        cwd: root,
        env: {
          ...process.env,
          MULTIPLAYER_URL: backend?.url ?? "",
          NODE_ENV: "development",
          DEV_PREVIEW_PORT: String(port),
        },
        stdout: "inherit",
        stderr: "inherit",
      });
      if ((await child.exited) !== 0) throw new Error("Demo build failed.");
      console.log("Demo rebuilt; refresh the browser to see your changes.");
    }
  })().finally(() => {
    building = undefined;
  });
  return building;
}
if (development) {
  try {
    await rebuild();
  } catch (error) {
    await backend?.stop();
    throw error;
  }
  watcher = watch(resolve(root, "src"), { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      void rebuild().catch(console.error);
    }, 150);
  });
}
const server = await Promise.resolve()
  .then(() =>
    Bun.serve({
      hostname: "127.0.0.1",
      port,
      fetch(request) {
        const pathname = new URL(request.url).pathname;
        if (pathname === "/" || pathname === "/index.html")
          return new Response(Bun.file(`${demo}/index.html`));
        if (pathname === "/index.js") return new Response(Bun.file(`${demo}/index.js`));
        if (pathname.startsWith("/assets/")) {
          const path = resolve(demo, `.${decodeURIComponent(pathname)}`);
          if (path.startsWith(demo + sep) && path.endsWith(".png"))
            return new Response(Bun.file(path));
        }
        return new Response("Not found", { status: 404 });
      },
    }),
  )
  .catch(async (error: unknown) => {
    watcher?.close();
    await backend?.stop();
    throw error;
  });
console.log(`Cardgame preview: http://127.0.0.1:${server.port}`);
const stop = async (): Promise<void> => {
  clearTimeout(timer);
  watcher?.close();
  await server.stop(true);
  await backend?.stop();
  process.exit(0);
};
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void stop().catch((error: unknown) => {
      console.error("Could not stop the development preview:", error);
      process.exit(1);
    });
  });
}

// Development/test file server only; deploy the generated demo/ directory as static files.
import { resolve, sep } from "node:path";

const demo = resolve(import.meta.dirname, "../demo");
Bun.serve({
  hostname: "127.0.0.1",
  port: 4175,
  fetch(request) {
    const pathname = new URL(request.url).pathname;
    if (pathname === "/" || pathname === "/index.html")
      return new Response(Bun.file(`${demo}/index.html`));
    if (pathname === "/index.js") return new Response(Bun.file(`${demo}/index.js`));
    if (pathname.startsWith("/assets/")) {
      const path = resolve(demo, `.${decodeURIComponent(pathname)}`);
      if (path.startsWith(demo + sep) && path.endsWith(".png")) return new Response(Bun.file(path));
    }
    return new Response("Not found", { status: 404 });
  },
});

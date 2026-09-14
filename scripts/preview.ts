// Development/test file server only; deploy the generated demo/ directory as static files.
import { resolve } from "node:path";

const demo = resolve(import.meta.dirname, "../demo");
Bun.serve({
  hostname: "127.0.0.1",
  port: 4175,
  fetch(request) {
    const pathname = new URL(request.url).pathname;
    if (pathname === "/" || pathname === "/index.html")
      return new Response(Bun.file(`${demo}/index.html`));
    if (pathname === "/index.js") return new Response(Bun.file(`${demo}/index.js`));
    return new Response("Not found", { status: 404 });
  },
});

import { startServer } from "@server/http.js";

const development = process.env.MULTIPLAYER_DEV === "1";
const cert = process.env.TLS_CERT,
  key = process.env.TLS_KEY;
if (!development && (!cert || !key))
  throw new Error(
    "Production requires TLS_CERT and TLS_KEY. For loopback development use MULTIPLAYER_DEV=1.",
  );
const app = startServer({
  hostname: development ? "127.0.0.1" : "0.0.0.0",
  port: Number(process.env.PORT ?? (development ? 8787 : 8443)),
  origins: development
    ? [
        "http://127.0.0.1:4175",
        "http://127.0.0.1:4174",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
      ]
    : ["https://people.arcada.fi"],
  tls: cert && key ? { cert: Bun.file(cert), key: Bun.file(key) } : undefined,
});
console.log(`Multiplayer listening on ${app.server.url.origin}`);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    void app.stop().then(() => process.exit(0));
  });

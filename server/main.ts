import { startServer } from "@server/http.js";

import { serverConfiguration } from "@server/config.js";
import { isDevelopment } from "@cardgame/multiplayer/config.js";

const configuration = serverConfiguration(
  process.env,
  process.argv.includes("--dev") || isDevelopment(process.env),
);
const app = startServer({
  ...configuration,
  tls: configuration.tls
    ? { cert: Bun.file(configuration.tls.cert), key: Bun.file(configuration.tls.key) }
    : undefined,
});
console.log(`Multiplayer listening on ${app.server.url.origin}`);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    void app.stop().then(() => process.exit(0));
  });

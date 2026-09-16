import {
  configuredPort,
  DEFAULT_MULTIPLAYER_PORT,
  DEFAULT_TLS_PORT,
  developmentOrigins,
  type Environment,
  isDevelopment,
  isLoopbackHost,
} from "@cardgame/multiplayer/config.js";

type TlsPaths = Readonly<{ cert: string; key: string }>;
export type ServerConfiguration = Readonly<{
  hostname: string;
  port: number;
  origins: readonly string[];
  tls?: TlsPaths;
}>;

export function allowedOrigins(
  value: string | undefined,
  defaults: readonly string[],
): readonly string[] {
  if (value === undefined) return defaults;
  const origins = value.split(",").map((origin) => origin.trim());
  if (
    !origins.length ||
    origins.some((origin) => {
      try {
        const url = new URL(origin);
        return (
          !["http:", "https:"].includes(url.protocol) ||
          url.origin !== origin ||
          url.hostname.includes("*")
        );
      } catch {
        return true;
      }
    })
  )
    throw new Error(
      "MULTIPLAYER_ORIGINS must contain comma-separated HTTP(S) origins without paths or wildcards.",
    );
  return [...new Set(origins)];
}

export function serverConfiguration(
  env: Environment,
  development = isDevelopment(env),
): ServerConfiguration {
  const tlsMode = env.MULTIPLAYER_TLS_MODE ?? "direct";
  if (tlsMode !== "direct" && tlsMode !== "proxy")
    throw new Error("MULTIPLAYER_TLS_MODE must be direct or proxy.");
  const cert = env.TLS_CERT,
    key = env.TLS_KEY;
  if (tlsMode === "proxy" && (cert || key))
    throw new Error("Unset TLS_CERT and TLS_KEY when MULTIPLAYER_TLS_MODE=proxy.");
  if (!!cert !== !!key) throw new Error("Set TLS_CERT and TLS_KEY together.");
  if (!development && tlsMode === "direct" && (!cert || !key))
    throw new Error(
      "Production requires TLS_CERT and TLS_KEY, or MULTIPLAYER_TLS_MODE=proxy behind an HTTPS proxy. For loopback development use bun run server:dev.",
    );
  const hostname = env.MULTIPLAYER_HOST ?? (development ? "127.0.0.1" : "0.0.0.0");
  if (development && !isLoopbackHost(hostname))
    throw new Error("The development game server must bind to localhost or a loopback address.");
  return {
    hostname,
    port: configuredPort(
      env.MULTIPLAYER_PORT ?? env.PORT,
      development || tlsMode === "proxy" ? DEFAULT_MULTIPLAYER_PORT : DEFAULT_TLS_PORT,
    ),
    origins: allowedOrigins(
      env.MULTIPLAYER_ORIGINS,
      development ? developmentOrigins : ["https://people.arcada.fi"],
    ),
    tls: cert && key ? { cert, key } : undefined,
  };
}

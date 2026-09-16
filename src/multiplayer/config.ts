import { serverUrl } from "@cardgame/multiplayer/protocol.js";

export type Environment = Readonly<Record<string, string | undefined>>;
export const DEFAULT_MULTIPLAYER_PORT = 8787;
export const DEFAULT_TLS_PORT = 8443;
const developmentPreviewPorts = [4173, 4174, 4175] as const;
export const developmentOrigins: readonly string[] = developmentPreviewPorts.flatMap((port) =>
  ["127.0.0.1", "localhost"].map((host) => `http://${host}:${port}`),
);
export const loopbackHosts = ["localhost", "127.0.0.1", "[::1]", "::1"] as const;
export const isLoopbackHost = (host: string): boolean =>
  loopbackHosts.some((loopback) => loopback === host);
export const isDevelopment = (env: Environment): boolean =>
  env.MULTIPLAYER_DEV === "1" || env.NODE_ENV === "development";

export function configuredPort(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const port = Number(value);
  if (!/^\d+$/.test(value) || !Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("The server port must be an integer between 1 and 65535.");
  return port;
}

/** Explicit common override, then mode-specific URL, then a development-only default. */
export function multiplayerUrl(env: Environment, development = isDevelopment(env)): string {
  const configured =
    env.MULTIPLAYER_URL ?? (development ? env.MULTIPLAYER_DEV_URL : env.MULTIPLAYER_PROD_URL);
  if (configured !== undefined) return configured.trim() ? serverUrl(configured.trim()) : "";
  return development
    ? `http://127.0.0.1:${configuredPort(env.MULTIPLAYER_PORT, DEFAULT_MULTIPLAYER_PORT)}`
    : "";
}

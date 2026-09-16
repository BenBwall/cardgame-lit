import { resolve } from "node:path";
import {
  developmentOrigins,
  isLoopbackHost,
  multiplayerUrl,
  type Environment,
} from "@cardgame/multiplayer/config.js";
import { PROTOCOL_VERSION } from "@cardgame/multiplayer/protocol.js";

type DevelopmentServerOptions = Readonly<{
  directory: string;
  env: Environment;
  origins: readonly string[];
}>;
export type DevelopmentServer = Readonly<{ url: string; stop: () => Promise<void> }>;
const STARTUP_TIMEOUT_MS = 15_000;
const HEALTH_TIMEOUT_MS = 500;
const RETRY_DELAY_MS = 100;

async function healthy(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url}/health`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    const value: unknown = await response.json();
    return (
      response.ok &&
      typeof value === "object" &&
      value !== null &&
      "status" in value &&
      value.status === "ok" &&
      "protocol" in value &&
      value.protocol === PROTOCOL_VERSION
    );
  } catch {
    return false;
  }
}

/** Start only the loopback HTTP backend owned by this preview; reuse existing servers. */
export async function startDevelopmentServer(
  options: DevelopmentServerOptions,
): Promise<DevelopmentServer> {
  const url = multiplayerUrl(options.env, true);
  const unmanaged: DevelopmentServer = { url, stop: async () => {} };
  if (!url) return unmanaged;
  const endpoint = new URL(url);
  if (endpoint.protocol !== "http:" || !isLoopbackHost(endpoint.hostname)) {
    console.log(`Using configured multiplayer server: ${url}`);
    return unmanaged;
  }
  if (await healthy(url)) {
    console.log(`Using running multiplayer server: ${url}`);
    return unmanaged;
  }
  const child = Bun.spawn(
    [process.execPath, resolve(options.directory, "server/main.ts"), "--dev"],
    {
      cwd: options.directory,
      env: {
        ...options.env,
        MULTIPLAYER_HOST: endpoint.hostname.replace(/^\[|\]$/g, ""),
        MULTIPLAYER_PORT: endpoint.port || "80",
        MULTIPLAYER_ORIGINS:
          options.env.MULTIPLAYER_ORIGINS ??
          [...new Set([...developmentOrigins, ...options.origins])].join(","),
        // A loopback HTTP preview must not inherit a production TLS listener.
        TLS_CERT: "",
        TLS_KEY: "",
      },
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  const stop = async (): Promise<void> => {
    if (child.exitCode === null) child.kill();
    await child.exited;
  };
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  try {
    while (Date.now() < deadline && child.exitCode === null) {
      if (await healthy(url)) return { url, stop };
      await Bun.sleep(RETRY_DELAY_MS);
    }
    throw new Error(
      `The development multiplayer server did not start at ${url}. Check its port and configuration.`,
    );
  } catch (error) {
    await stop();
    throw error;
  }
}

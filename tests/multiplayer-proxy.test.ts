import { expect, test } from "bun:test";
import { resolve } from "node:path";
import type { Admission } from "@cardgame/multiplayer/protocol.js";

test("production entrypoint serves HTTP behind a proxy while enforcing origins and credentials", async () => {
  const reservation = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
  const port = reservation.port!;
  await reservation.stop(true);
  const url = `http://127.0.0.1:${port}`;
  const child = Bun.spawn([process.execPath, "server/main.ts"], {
    cwd: resolve(import.meta.dirname, ".."),
    env: {
      ...process.env,
      NODE_ENV: "production",
      MULTIPLAYER_DEV: "0",
      MULTIPLAYER_TLS_MODE: "proxy",
      MULTIPLAYER_HOST: "127.0.0.1",
      MULTIPLAYER_PORT: String(port),
      MULTIPLAYER_ORIGINS: "https://people.arcada.fi",
      TLS_CERT: "",
      TLS_KEY: "",
    },
    stdout: "inherit",
    stderr: "inherit",
  });
  try {
    let ready = false;
    const deadline = Date.now() + 5000;
    while (!ready && child.exitCode === null && Date.now() < deadline) {
      try {
        ready = (await fetch(`${url}/health`, { signal: AbortSignal.timeout(200) })).ok;
      } catch {
        /* The child has not bound its port yet. */
      }
      if (!ready) await Bun.sleep(25);
    }
    expect(ready).toBe(true);
    expect(await (await fetch(`${url}/health`)).json()).toEqual({ status: "ok", protocol: 1 });
    const post = (path: string, body: unknown, origin: string, credential?: string) =>
      fetch(`${url}${path}`, {
        method: "POST",
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
        },
        body: JSON.stringify(body),
      });
    const body = { gameId: "shithead", options: {}, username: "Proxy player" };
    expect((await post("/rooms", body, "http://localhost:4175")).status).toBe(403);
    const origin = "https://people.arcada.fi";
    const created = await post("/rooms", body, origin);
    expect(created.status).toBe(201);
    const admission = (await created.json()) as Admission;
    const path = `/rooms/${admission.code}/ticket`;
    expect((await post(path, { playerId: admission.playerId }, origin)).status).toBe(401);
    expect(
      (await post(path, { playerId: admission.playerId }, origin, admission.credential)).status,
    ).toBe(200);
  } finally {
    child.kill();
    await child.exited;
  }
}, 10_000);

import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { startDevelopmentServer } from "@dev/dev-server.js";

test("development launcher starts a real backend, configures CORS, reuses it and stops only its own process", async () => {
  const reservation = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
  const port = reservation.port!;
  await reservation.stop(true);
  const url = `http://127.0.0.1:${port}`;
  const origin = "http://localhost:4999";
  const options = {
    directory: resolve(import.meta.dirname, ".."),
    env: { ...process.env, MULTIPLAYER_URL: url, MULTIPLAYER_ORIGINS: undefined },
    origins: [origin],
  };
  const owned = await startDevelopmentServer(options);
  try {
    expect(owned.url).toBe(url);
    expect(await (await fetch(`${url}/health`)).json()).toEqual({ status: "ok", protocol: 1 });
    const response = await fetch(`${url}/rooms`, {
      method: "OPTIONS",
      headers: { Origin: origin, "Access-Control-Request-Method": "POST" },
    });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    const reused = await startDevelopmentServer(options);
    await reused.stop();
    expect((await fetch(`${url}/health`)).ok).toBe(true);
  } finally {
    await owned.stop();
  }
  await expect(fetch(`${url}/health`, { signal: AbortSignal.timeout(500) })).rejects.toThrow();
}, 20_000);

test("disabled and externally hosted development URLs do not launch local processes", async () => {
  for (const url of ["", "https://cards.example.org"]) {
    const server = await startDevelopmentServer({
      directory: "/does-not-exist",
      env: { MULTIPLAYER_URL: url },
      origins: [],
    });
    expect(server.url).toBe(url);
    await server.stop();
  }
});

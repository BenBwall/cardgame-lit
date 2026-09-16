import { afterEach, expect, test } from "bun:test";
import { startServer } from "../server/http.js";
import type { Admission, ServerMessage } from "../src/multiplayer/protocol.js";

const origin = "https://people.arcada.fi";
async function until(check: () => boolean) {
  const deadline = Date.now() + 2000;
  while (!check() && Date.now() < deadline) await Bun.sleep(5);
  expect(check()).toBe(true);
}
const apps: ReturnType<typeof startServer>[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.stop();
});
function setup() {
  const app = startServer({ port: 0 });
  apps.push(app);
  const post = (path: string, body: unknown, credential?: string, from = origin) =>
    fetch(new URL(path, app.server.url), {
      method: "POST",
      headers: {
        Origin: from,
        "Content-Type": "application/json",
        ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
      },
      body: JSON.stringify(body),
    });
  const create = async () =>
    (await (
      await post("/rooms", { gameId: "shithead", options: {}, username: "Guest" })
    ).json()) as Admission;
  return { app, post, create };
}
test("health, exact CORS, preflights, methods, bounded body and malformed JSON", async () => {
  const { app, post } = setup();
  const health = await fetch(new URL("/health", app.server.url));
  expect(await health.json()).toEqual({ status: "ok", protocol: 1 });
  const preflight = await fetch(new URL("/rooms", app.server.url), {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization, content-type",
    },
  });
  expect(preflight.status).toBe(204);
  expect(preflight.headers.get("access-control-allow-origin")).toBe(origin);
  expect(preflight.headers.get("access-control-allow-credentials")).toBeNull();
  for (const from of ["https://evil.example", "null", "", `${origin}.evil.example`]) {
    const response = await post("/rooms", {}, undefined, from);
    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  }
  const tooBig = await post("/rooms", { username: "x".repeat(5000) });
  expect(tooBig.status).toBe(413);
  const bad = await fetch(new URL("/rooms", app.server.url), {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: "{",
  });
  expect(bad.status).toBe(400);
  const noJson = await fetch(new URL("/rooms", app.server.url), {
    method: "POST",
    headers: { Origin: origin },
    body: "test",
  });
  expect(noJson.status).toBe(415);
});
test("same-origin pages still require credentials; room codes and names are not authentication", async () => {
  const { post, create } = setup();
  const a = await create();
  const b = (await (
    await post(`/rooms/${a.code.toLowerCase()}/join`, { username: "Guest" })
  ).json()) as Admission;
  for (const credential of [undefined, a.code, "Guest", b.credential]) {
    const r = await post(`/rooms/${a.code}/ticket`, { playerId: a.playerId }, credential);
    expect(r.status).toBe(401);
  }
  const ticket = await post(`/rooms/${a.code}/ticket`, { playerId: a.playerId }, a.credential);
  expect(ticket.status).toBe(200);
  expect(ticket.headers.get("cache-control")).toBe("no-store");
  expect((await ticket.json()).ticket).toHaveLength(43);
  const leave = await post(`/rooms/${a.code}/leave`, { playerId: a.playerId }, b.credential);
  expect(leave.status).toBe(401);
});
test("creation and IP rate limiting ignore spoofed forwarded IP headers", async () => {
  const { post, app } = setup();
  for (let i = 0; i < 12; i++)
    expect((await post("/rooms", { gameId: "shithead", options: {}, username: "A" })).status).toBe(
      201,
    );
  expect((await post("/rooms", { gameId: "shithead", options: {}, username: "A" })).status).toBe(
    429,
  );
  const spoofed = await fetch(new URL("/rooms", app.server.url), {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      "X-Forwarded-For": "192.0.2.123",
    },
    body: JSON.stringify({ gameId: "shithead", options: {}, username: "B" }),
  });
  expect(spoofed.status).toBe(429);
});

const NativeSocket = WebSocket as unknown as {
  new (url: string, options: Bun.WebSocketOptions): WebSocket;
};

test("simultaneous joins cannot take the same final seat", async () => {
  const { post, create } = setup();
  const admission = await create();
  const responses = await Promise.all(
    ["Guest", "Guest"].map((username) => post(`/rooms/${admission.code}/join`, { username })),
  );
  expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
});
function socket(url: string, ticket: string, from = origin) {
  const ws = new NativeSocket(url, {
    headers: { Origin: from, "Sec-WebSocket-Protocol": `cardgame.v1, ticket.${ticket}` },
  });
  const messages: ServerMessage[] = [];
  ws.addEventListener("message", (e) => {
    messages.push(JSON.parse(String(e.data)));
  });
  const closed = new Promise<number>((resolve) =>
    ws.addEventListener("close", (e) => resolve(e.code)),
  );
  return { ws, messages, closed };
}
test("real WebSocket handshake enforces origin/tickets; wire projections hide hands; malformed and oversized frames", async () => {
  const { app, post, create } = setup();
  const a = await create();
  const b = (await (
    await post(`/rooms/${a.code}/join`, { username: "Guest" })
  ).json()) as Admission;
  const issue = async (player: Admission) =>
    (
      await (
        await post(`/rooms/${a.code}/ticket`, { playerId: player.playerId }, player.credential)
      ).json()
    ).ticket as string;
  const url = `${app.server.url.origin.replace("http:", "ws:")}/rooms/${a.code}/socket`;
  const token = await issue(a);
  const badOrigin = socket(url, token, "https://evil.example");
  await badOrigin.closed;
  expect(badOrigin.messages).toHaveLength(0);
  const first = socket(url, token);
  await until(() => first.messages.some((m) => m.type === "snapshot"));
  const replay = socket(url, token);
  await replay.closed;
  expect(replay.messages).toHaveLength(0);
  const second = socket(url, await issue(b));
  await until(() => second.messages.some((m) => m.type === "snapshot"));
  const snapshot = first.messages.findLast((m) => m.type === "snapshot")!;
  if (snapshot.type !== "snapshot") throw new Error("Missing snapshot");
  first.ws.send(JSON.stringify({ type: "start", sequence: 1, revision: snapshot.room.revision }));
  await until(() =>
    second.messages.some((m) => m.type === "snapshot" && m.room.phase === "playing"),
  );
  const latest = second.messages.findLast((m) => m.type === "snapshot");
  expect(latest).toMatchObject({
    room: { state: { players: [{ hand: null }, { hand: expect.any(Array) }] } },
  });
  first.ws.send("{");
  await until(() => first.messages.some((m) => m.type === "error"));
  first.ws.send("x".repeat(5000));
  expect(await first.closed).not.toBe(1000);
  second.ws.close();
});
test("malformed WebSocket frames are rate-limited before parsing", async () => {
  const { app, post, create } = setup();
  const a = await create();
  const { ticket } = await (
    await post(`/rooms/${a.code}/ticket`, { playerId: a.playerId }, a.credential)
  ).json();
  const client = socket(
    `${app.server.url.origin.replace("http:", "ws:")}/rooms/${a.code}/socket`,
    ticket,
  );
  await until(() => client.messages.some((m) => m.type === "snapshot"));
  for (let i = 0; i < 101; i++) client.ws.send("{");
  expect(await client.closed).toBe(4003);
});

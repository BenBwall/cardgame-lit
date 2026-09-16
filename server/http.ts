import type { ServerWebSocket } from "bun";
import { PROTOCOL_VERSION, isRecord } from "@cardgame/multiplayer/protocol.js";
import { Fault, RoomService, type Peer } from "@server/core/rooms.js";
import { games } from "@server/games/registry.js";

type TlsOptions = { cert: ReturnType<typeof Bun.file>; key: ReturnType<typeof Bun.file> };
type RateBucket = { count: number; creates: number; reset: number };

type SocketData = {
  code: string;
  playerId: string;
  peer?: Peer;
  frames?: number;
  windowStart?: number;
};
export type ServerOptions = {
  port?: number;
  hostname?: string;
  origins?: readonly string[];
  service?: RoomService;
  tls?: TlsOptions;
};

/** Bun's uWebSockets-backed server provides bounded frames, backpressure and TLS. */
export function startServer(options: ServerOptions = {}) {
  const service = options.service ?? new RoomService(games);
  const origins = new Set(options.origins ?? ["https://people.arcada.fi"]);
  const buckets = new Map<string, RateBucket>();
  const timer = setInterval(() => {
    service.cleanup();
    for (const [ip, bucket] of buckets) if (bucket.reset <= Date.now()) buckets.delete(ip);
  }, 15_000);
  timer.unref();
  const server = Bun.serve<SocketData>({
    hostname: options.hostname ?? "127.0.0.1",
    port: options.port ?? 8787,
    tls: options.tls,
    maxRequestBodySize: 4096,
    async fetch(request, server) {
      const url = new URL(request.url),
        origin = request.headers.get("origin") ?? "";
      const headers = new Headers({
        "Cache-Control": "no-store",
        Vary: "Origin",
        "X-Content-Type-Options": "nosniff",
      });
      if (origins.has(origin)) headers.set("Access-Control-Allow-Origin", origin);
      const json = (value: unknown, status = 200) => Response.json(value, { status, headers });
      try {
        if (url.pathname === "/health" && request.method === "GET")
          return json({ status: "ok", protocol: PROTOCOL_VERSION });
        if (!origins.has(origin)) throw new Fault("Origin not allowed.", 403);
        const ip = server.requestIP(request)?.address ?? "unknown";
        const now = Date.now();
        let bucket = buckets.get(ip);
        if (!bucket || bucket.reset <= now) {
          if (buckets.size >= 10_000 && !bucket) throw new Fault("Server busy.", 503);
          bucket = { count: 0, creates: 0, reset: now + 60_000 };
          buckets.set(ip, bucket);
        }
        if (++bucket.count > 240) throw new Fault("Too many requests. Wait a minute.", 429);
        if (request.method === "OPTIONS") {
          if (request.headers.get("access-control-request-method") !== "POST")
            throw new Fault("Method not allowed.", 405);
          const requested = (request.headers.get("access-control-request-headers") ?? "")
            .toLowerCase()
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          if (requested.some((h) => !["content-type", "authorization"].includes(h)))
            throw new Fault("Header not allowed.", 403);
          headers.set("Access-Control-Allow-Methods", "POST");
          headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
          headers.set("Access-Control-Max-Age", "600");
          return new Response(null, { status: 204, headers });
        }
        const socketRoute = /^\/rooms\/([^/]+)\/socket$/.exec(url.pathname);
        if (socketRoute && request.method === "GET") {
          if (url.search) throw new Fault("Use a ticket subprotocol, not URL credentials.");
          const protocols = (request.headers.get("sec-websocket-protocol") ?? "")
            .split(",")
            .map((p) => p.trim());
          if (
            protocols.length !== 2 ||
            protocols[0] !== "cardgame.v1" ||
            !protocols[1].startsWith("ticket.")
          )
            throw new Fault("Missing ticket.", 401);
          const data = service.consumeTicket(socketRoute[1], protocols[1].slice(7), origin);
          if (
            server.upgrade(request, { data, headers: { "Sec-WebSocket-Protocol": "cardgame.v1" } })
          )
            return;
          throw new Fault("WebSocket upgrade failed.");
        }
        if (request.method !== "POST") throw new Fault("Method not allowed.", 405);
        if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
          throw new Fault("JSON required.", 415);
        const body: unknown = await request.json().catch(() => {
          throw new Fault("Invalid JSON.");
        });
        if (!isRecord(body)) throw new Fault("Invalid request.");
        if (url.pathname === "/rooms") {
          if (++bucket.creates > 12) throw new Fault("Too many new rooms. Wait a minute.", 429);
          return json(service.create(body.gameId, body.options, body.username), 201);
        }
        const route = /^\/rooms\/([^/]+)\/(join|ticket|leave)$/.exec(url.pathname);
        if (!route) throw new Fault("Not found.", 404);
        const [, code, operation] = route;
        if (operation === "join") return json(service.join(code, body.username), 201);
        const credential = request.headers.get("authorization")?.replace(/^Bearer /, "");
        if (operation === "ticket")
          return json({ ticket: service.ticket(code, body.playerId, credential, origin) });
        service.leave(code, body.playerId, credential);
        return json({ ok: true });
      } catch (error) {
        if (error instanceof Fault) return json({ error: error.message }, error.status);
        return json({ error: "Request failed." }, 500);
      }
    },
    websocket: {
      maxPayloadLength: 4096,
      idleTimeout: 60,
      backpressureLimit: 64 * 1024,
      closeOnBackpressureLimit: true,
      perMessageDeflate: false,
      open(socket: ServerWebSocket<SocketData>) {
        const peer: Peer = {
          send: (message) => {
            socket.send(JSON.stringify(message));
          },
          close: (code, reason) => socket.close(code, reason),
        };
        socket.data.peer = peer;
        try {
          service.connect(socket.data.code, socket.data.playerId, peer);
        } catch {
          socket.close(4000, "Room unavailable.");
        }
      },
      message(socket, message) {
        try {
          // Count every frame, including malformed JSON and binary data, before parsing.
          const now = Date.now();
          if (!socket.data.windowStart || now - socket.data.windowStart >= 10_000) {
            socket.data.windowStart = now;
            socket.data.frames = 0;
          }
          socket.data.frames = (socket.data.frames ?? 0) + 1;
          if (socket.data.frames > 100) throw new Fault("Too many messages.", 429);
          if (typeof message !== "string") throw new Fault("Only JSON text messages are accepted.");
          let value: unknown;
          try {
            value = JSON.parse(message);
          } catch {
            throw new Fault("Invalid JSON.");
          }
          service.receive(socket.data.code, socket.data.playerId, socket.data.peer!, value);
        } catch (error) {
          socket.send(
            JSON.stringify({
              type: "error",
              error: error instanceof Fault ? error.message : "Command failed.",
            }),
          );
          if (!(error instanceof Fault) || [401, 404, 429].includes(error.status))
            socket.close(4003, "Connection rejected.");
        }
      },
      close(socket) {
        if (socket.data.peer)
          service.disconnect(socket.data.code, socket.data.playerId, socket.data.peer);
      },
    },
  });
  return {
    server,
    service,
    async stop() {
      clearInterval(timer);
      service.shutdown();
      await server.stop(true);
    },
  };
}

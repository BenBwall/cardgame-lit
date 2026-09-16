/** Versioned, game-independent wire protocol. Names are presentation only. */
export const PROTOCOL_VERSION = 1;
export type Admission = { code: string; playerId: string; credential: string; expiresAt: number };
export type RoomView<View = unknown> = {
  code: string;
  gameId: string;
  revision: number;
  round: number;
  phase: "waiting" | "playing" | "finished";
  self: string;
  creator: string;
  players: { id: string; username: string; connected: boolean; rematch: boolean }[];
  options: unknown;
  state: View | null;
  expiresAt: number;
};
export type Command = {
  type: "action" | "start" | "rematch";
  sequence: number;
  revision: number;
  action?: unknown;
};
export type ServerMessage =
  | { type: "snapshot"; room: RoomView; sequence: number }
  | { type: "ack"; sequence: number; accepted: boolean; error?: string }
  | { type: "error"; error: string }
  | { type: "closed"; reason: string }
  | { type: "ping" };

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function serverUrl(value: string): string {
  const url = new URL(value);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(loopback && url.protocol === "http:"))
    throw new Error("Online play needs an HTTPS server URL.");
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/")
    throw new Error("Use the server origin without a path, credentials, or query.");
  return url.origin;
}

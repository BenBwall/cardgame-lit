import { createHash, randomBytes, randomInt } from "node:crypto";
import {
  isRecord,
  type Admission,
  type RoomView,
  type ServerMessage,
} from "@cardgame/multiplayer/protocol.js";
import type { GameInstance, RegisteredGame } from "@server/core/adapter.js";

export class Fault extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
export interface Peer {
  send(message: ServerMessage): void;
  close(code: number, reason: string): void;
}
type Ack = Extract<ServerMessage, { type: "ack" }>;
type ConnectionTicket = { hash: string; origin: string; expiresAt: number };
type AuthorizedPlayer = { room: Room; player: Player };
type TicketIdentity = { code: string; playerId: string };

export type Player = {
  id: string;
  username: string;
  credentialHash: string;
  peer?: Peer;
  disconnectedAt: number;
  lastPong: number;
  sequence: number;
  lastAck?: Ack;
  rematch: boolean;
  ticket?: ConnectionTicket;
  messages: number;
  windowStart: number;
};
export type Room = {
  code: string;
  gameId: string;
  adapter: RegisteredGame;
  options: unknown;
  creator: string;
  players: Player[];
  game?: GameInstance;
  revision: number;
  round: number;
  createdAt: number;
  touchedAt: number;
};
/** Synchronous transactions in one Bun process. A distributed store must provide atomic mutations. */
export interface RoomStore {
  get(code: string): Room | undefined;
  put(room: Room): void;
  delete(code: string): void;
  values(): Iterable<Room>;
  readonly size: number;
}
export class MemoryRoomStore implements RoomStore {
  private rooms = new Map<string, Room>();
  get size() {
    return this.rooms.size;
  }
  get(code: string) {
    return this.rooms.get(code);
  }
  put(room: Room) {
    this.rooms.set(room.code, room);
  }
  delete(code: string) {
    this.rooms.delete(code);
  }
  values() {
    return this.rooms.values();
  }
}
export type Limits = {
  idleMs: number;
  lifetimeMs: number;
  reconnectMs: number;
  ticketMs: number;
  heartbeatMs: number;
  maxRooms: number;
};
const defaults = {
  idleMs: 30 * 60_000,
  lifetimeMs: 2 * 60 * 60_000,
  reconnectMs: 2 * 60_000,
  ticketMs: 20_000,
  heartbeatMs: 45_000,
  maxRooms: 500,
} as const satisfies Limits;
const digest = (secret: string) => createHash("sha256").update(secret).digest("hex");
const secret = () => randomBytes(32).toString("base64url");
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function roomCode(value: unknown): string {
  if (typeof value !== "string" || !/^[a-z2-9]{6}$/i.test(value.trim()))
    throw new Fault("Invalid room code.");
  return value.trim().toUpperCase();
}
function username(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > 32 ||
    /[\p{Cc}\p{Cf}]/u.test(value)
  )
    throw new Fault("Choose a display name of 1–32 characters without control characters.");
  return value.trim();
}

export class RoomService {
  readonly limits: Limits;
  constructor(
    readonly registry: Readonly<Record<string, RegisteredGame>>,
    readonly store: RoomStore = new MemoryRoomStore(),
    private now = Date.now,
    limits: Partial<Limits> = {},
  ) {
    this.limits = { ...defaults, ...limits };
  }

  private expiry(room: Room) {
    return Math.min(room.createdAt + this.limits.lifetimeMs, room.touchedAt + this.limits.idleMs);
  }
  private room(code: unknown): Room {
    const room = this.store.get(roomCode(code));
    if (!room) throw new Fault("Room unavailable or expired.", 404);
    if (
      this.expiry(room) <= this.now() ||
      room.players.some((p) => !p.peer && p.disconnectedAt + this.limits.reconnectMs <= this.now())
    ) {
      this.end(room, "Room expired.");
      throw new Fault("Room unavailable or expired.", 404);
    }
    return room;
  }
  private addPlayer(room: Room, name: unknown): Admission {
    const display = username(name),
      credential = secret(),
      now = this.now();
    const player: Player = {
      id: randomBytes(16).toString("hex"),
      username: display,
      credentialHash: digest(credential),
      disconnectedAt: now,
      lastPong: now,
      sequence: 0,
      rematch: false,
      messages: 0,
      windowStart: now,
    };
    room.players.push(player);
    room.creator ||= player.id;
    room.revision++;
    room.touchedAt = now;
    this.broadcast(room);
    return {
      code: room.code,
      playerId: player.id,
      credential,
      expiresAt: room.createdAt + this.limits.lifetimeMs,
    };
  }
  create(gameId: unknown, options: unknown, name: unknown): Admission {
    if (typeof gameId !== "string" || !Object.hasOwn(this.registry, gameId))
      throw new Fault("Unknown game.");
    username(name);
    const adapter = this.registry[gameId];
    let parsed: unknown;
    try {
      parsed = adapter.parseOptions(options);
    } catch {
      throw new Fault("Invalid game options.");
    }
    this.cleanup();
    if (this.store.size >= this.limits.maxRooms)
      throw new Fault("Server is full. Try again later.", 503);
    let code: string;
    do {
      code = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join("");
    } while (this.store.get(code));
    const now = this.now();
    const room: Room = {
      code,
      gameId,
      adapter,
      options: parsed,
      creator: "",
      players: [],
      revision: 0,
      round: 0,
      createdAt: now,
      touchedAt: now,
    };
    this.store.put(room);
    return this.addPlayer(room, name);
  }
  join(code: unknown, name: unknown): Admission {
    const room = this.room(code);
    if (room.game || room.players.length >= room.adapter.maxPlayers)
      throw new Fault("Room is full or already playing.", 409);
    return this.addPlayer(room, name);
  }
  authorize(code: unknown, playerId: unknown, credential: unknown): AuthorizedPlayer {
    const room = this.room(code);
    const player = room.players.find((p) => p.id === playerId);
    if (
      !player ||
      typeof credential !== "string" ||
      credential.length !== 43 ||
      player.credentialHash !== digest(credential)
    )
      throw new Fault("Session is unavailable. Create or join a room again.", 401);
    return { room, player };
  }
  ticket(code: unknown, playerId: unknown, credential: unknown, origin: string): string {
    const { player } = this.authorize(code, playerId, credential);
    this.allowMessage(player);
    const ticket = secret();
    // At most one outstanding ticket per player, never an unbounded ticket table.
    player.ticket = { hash: digest(ticket), origin, expiresAt: this.now() + this.limits.ticketMs };
    return ticket;
  }
  consumeTicket(code: unknown, ticket: string, origin: string): TicketIdentity {
    const room = this.room(code);
    const player =
      ticket.length === 43
        ? room.players.find((p) => p.ticket?.hash === digest(ticket))
        : undefined;
    const stored = player?.ticket;
    if (!player || !stored || stored.origin !== origin || stored.expiresAt <= this.now())
      throw new Fault("Invalid or expired ticket.", 401);
    player.ticket = undefined;
    return { code: room.code, playerId: player.id };
  }
  connect(code: string, playerId: string, peer: Peer): void {
    const room = this.room(code),
      player = room.players.find((p) => p.id === playerId);
    if (!player) throw new Fault("Session unavailable.", 401);
    const previous = player.peer;
    player.peer = peer;
    player.lastPong = this.now();
    previous?.close(4001, "Connected elsewhere.");
    room.revision++;
    this.broadcast(room);
  }
  disconnect(code: string, playerId: string, peer: Peer): void {
    const room = this.store.get(code),
      player = room?.players.find((p) => p.id === playerId);
    if (!room || !player || player.peer !== peer) return;
    player.peer = undefined;
    player.disconnectedAt = this.now();
    room.revision++;
    this.broadcast(room);
  }
  leave(code: unknown, playerId: unknown, credential: unknown): void {
    const { room } = this.authorize(code, playerId, credential);
    this.end(room, "A player left the room.");
  }
  private allowMessage(player: Player): void {
    const now = this.now();
    if (now - player.windowStart >= 10_000) {
      player.windowStart = now;
      player.messages = 0;
    }
    if (++player.messages > 80) throw new Fault("Too many requests. Wait a moment.", 429);
  }
  receive(code: string, playerId: string, peer: Peer, value: unknown): void {
    const room = this.room(code),
      player = room.players.find((p) => p.id === playerId);
    if (!player || player.peer !== peer) throw new Fault("Connection replaced.", 401);
    this.allowMessage(player);
    if (isRecord(value) && value.type === "pong") {
      player.lastPong = this.now();
      return;
    }
    if (
      !isRecord(value) ||
      !["start", "action", "rematch"].includes(String(value.type)) ||
      !Number.isSafeInteger(value.sequence) ||
      Number(value.sequence) < 1 ||
      !Number.isSafeInteger(value.revision) ||
      Number(value.revision) < 0
    )
      throw new Fault("Invalid command.");
    const sequence = Number(value.sequence);
    // A persistent high-water mark prevents replay even after an old acknowledgement is discarded.
    if (sequence <= player.sequence) {
      peer.send(
        sequence === player.sequence && player.lastAck
          ? player.lastAck
          : { type: "ack", sequence, accepted: false, error: "Command already processed." },
      );
      this.snapshot(room, player);
      return;
    }
    if (sequence !== player.sequence + 1)
      throw new Fault("Command sequence gap. Reconnect to synchronize.");
    let error: string | undefined;
    if (value.revision !== room.revision)
      error = "The room changed. Review the latest state and try again.";
    else if (value.type === "start") {
      if (player.id !== room.creator) error = "Only the creator can start.";
      else if (
        room.game ||
        room.players.length < room.adapter.minPlayers ||
        room.players.some((p) => !p.peer)
      )
        error = "Wait for all players to connect before starting.";
      else {
        room.game = room.adapter.create(room.options, room.players.length);
        room.round++;
      }
    } else if (value.type === "rematch") {
      if (!room.game?.complete() || player.rematch) error = "Rematch is unavailable.";
      else if (room.players.some((p) => !p.peer))
        error = "Wait for all players to reconnect before requesting a rematch.";
      else {
        player.rematch = true;
        if (room.players.every((p) => p.rematch && p.peer)) {
          room.game = room.adapter.create(room.options, room.players.length);
          room.round++;
          for (const p of room.players) p.rematch = false;
        }
      }
    } else if (
      !room.game ||
      room.game.complete() ||
      !room.game.apply(room.players.indexOf(player), value.action)
    )
      error = "That move is not allowed.";
    player.sequence = sequence;
    player.lastAck = { type: "ack", sequence, accepted: !error, ...(error ? { error } : {}) };
    if (!error) {
      room.revision++;
      room.touchedAt = this.now();
    }
    peer.send(player.lastAck);
    if (!error) this.broadcast(room);
    else this.snapshot(room, player);
  }
  view(room: Room, player: Player): RoomView {
    return {
      code: room.code,
      gameId: room.gameId,
      revision: room.revision,
      round: room.round,
      phase: !room.game ? "waiting" : room.game.complete() ? "finished" : "playing",
      self: player.id,
      creator: room.creator,
      options: room.options,
      players: room.players.map((p) => ({
        id: p.id,
        username: p.username,
        connected: !!p.peer,
        rematch: p.rematch,
      })),
      state: room.game?.project(room.players.indexOf(player)) ?? null,
      expiresAt: this.expiry(room),
    };
  }
  private snapshot(room: Room, player: Player) {
    player.peer?.send({
      type: "snapshot",
      room: this.view(room, player),
      sequence: player.sequence,
    });
  }
  private broadcast(room: Room) {
    for (const player of room.players) this.snapshot(room, player);
  }
  private end(room: Room, reason: string) {
    this.store.delete(room.code);
    for (const p of room.players) {
      p.peer?.send({ type: "closed", reason });
      p.peer?.close(4000, reason);
      p.ticket = undefined;
      p.credentialHash = "";
    }
  }
  cleanup(): void {
    const now = this.now();
    for (const room of this.store.values()) {
      if (
        this.expiry(room) <= now ||
        room.players.some((p) => !p.peer && p.disconnectedAt + this.limits.reconnectMs <= now)
      ) {
        this.end(room, "Room expired.");
        continue;
      }
      for (const p of room.players) {
        if (p.ticket && p.ticket.expiresAt <= now) p.ticket = undefined;
        if (p.peer && p.lastPong + this.limits.heartbeatMs <= now) {
          const peer = p.peer;
          this.disconnect(room.code, p.id, peer);
          peer.close(4002, "Heartbeat timed out.");
        } else p.peer?.send({ type: "ping" });
      }
    }
  }
  shutdown(): void {
    for (const room of this.store.values())
      this.end(room, "Server restarting. Please create a new room.");
  }
}

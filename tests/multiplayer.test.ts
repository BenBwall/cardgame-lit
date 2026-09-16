import { describe, expect, test } from "bun:test";
import { RoomService, MemoryRoomStore, type Peer } from "../server/core/rooms.js";
import { defineGame } from "../server/core/adapter.js";
import { games } from "../server/games/registry.js";
import { shitheadAdapter } from "../server/games/shithead.js";
import { counterAdapter } from "./fixtures/counter.js";
import type { Admission, ServerMessage } from "../src/multiplayer/protocol.js";
import { serverUrl } from "../src/multiplayer/protocol.js";
import { cardId } from "../src/cards.js";
import { autoShithead, DEFAULT_SHITHEAD_RULES } from "../src/shithead-state.js";

function harness(gameId = "test-counter", options: unknown = { target: 2 }) {
  let time = 1_000;
  const service = new RoomService(
    { ...games, "test-counter": defineGame(counterAdapter) },
    new MemoryRoomStore(),
    () => time,
  );
  const a = service.create(gameId, options, "Same name"),
    b = service.join(a.code.toLowerCase(), "Same name");
  const attach = (admission: Admission) => {
    const messages: ServerMessage[] = [],
      closes: number[] = [];
    const peer: Peer = {
      send: (m) => messages.push(structuredClone(m)),
      close: (c) => closes.push(c),
    };
    service.connect(admission.code, admission.playerId, peer);
    return { peer, messages, closes };
  };
  const pa = attach(a),
    pb = attach(b);
  const room = () => service.store.get(a.code)!;
  const send = (
    admission: Admission,
    peer: Peer,
    type: string,
    action?: unknown,
    revision = room().revision,
    sequence?: number,
  ) => {
    const player = room().players.find((p) => p.id === admission.playerId)!;
    service.receive(a.code, admission.playerId, peer, {
      type,
      action,
      revision,
      sequence: sequence ?? player.sequence + 1,
    });
  };
  return {
    service,
    a,
    b,
    pa,
    pb,
    room,
    send,
    attach,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

describe("generic rooms", () => {
  test("duplicate names have independent opaque identities; case-insensitive admission; three seats", () => {
    const h = harness();
    expect(h.a.playerId).not.toBe(h.b.playerId);
    expect(h.a.credential).not.toBe(h.b.credential);
    expect(h.a.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(h.room().players.map((p) => p.username)).toEqual(["Same name", "Same name"]);
    const c = h.service.join(h.a.code, "Same name");
    h.attach(c);
    expect(() => h.service.join(h.a.code, "Fourth")).toThrow("full");
    h.send(h.a, h.pa.peer, "start");
    expect(h.room().game!.project(2)).toEqual({ count: 0, turn: 0, you: 2 });
  });
  test("names, room codes, other-room credentials and other-player credentials grant no authority", () => {
    const h = harness();
    for (const credential of [h.a.code, "Same name", h.b.credential, "", "x".repeat(43)])
      expect(() => h.service.authorize(h.a.code, h.a.playerId, credential)).toThrow();
    const other = h.service.create("shithead", {}, "Same name");
    expect(() => h.service.authorize(other.code, h.a.playerId, h.a.credential)).toThrow();
    const view = JSON.stringify(h.service.view(h.room(), h.room().players[0]));
    expect(view).not.toContain(h.a.credential);
    expect(view).not.toContain("credentialHash");
    h.send(h.b, h.pb.peer, "start");
    expect(h.room().game).toBeUndefined();
    expect(h.pb.messages).toContainEqual(expect.objectContaining({ type: "ack", accepted: false }));
  });
  test("tickets are origin-bound, room-bound, single-use, short-lived and superseded", () => {
    const h = harness();
    const issue = () =>
      h.service.ticket(h.a.code, h.a.playerId, h.a.credential, "https://people.arcada.fi");
    const one = issue(),
      two = issue();
    expect(() => h.service.consumeTicket(h.a.code, one, "https://people.arcada.fi")).toThrow();
    expect(() => h.service.consumeTicket(h.a.code, two, "https://evil.example")).toThrow();
    expect(h.service.consumeTicket(h.a.code, two, "https://people.arcada.fi").playerId).toBe(
      h.a.playerId,
    );
    expect(() => h.service.consumeTicket(h.a.code, two, "https://people.arcada.fi")).toThrow();
    const three = issue();
    h.advance(20_001);
    expect(() => h.service.consumeTicket(h.a.code, three, "https://people.arcada.fi")).toThrow();
  });
  test("revision conflicts, ordering and dedup prevent applying uncertain actions twice", () => {
    const h = harness();
    h.send(h.a, h.pa.peer, "start");
    const revision = h.room().revision;
    h.send(h.a, h.pa.peer, "action", { add: 1 });
    h.send(h.a, h.pa.peer, "action", { add: 1 }, revision, 2);
    expect(h.room().game!.project(0)).toMatchObject({ count: 1 });
    h.send(h.b, h.pb.peer, "action", { add: 1 }, revision);
    expect(h.room().game!.project(0)).toMatchObject({ count: 1 });
    expect(() => h.send(h.b, h.pb.peer, "action", { add: 1 }, h.room().revision, 99)).toThrow(
      "sequence",
    );
    h.send(h.b, h.pb.peer, "action", { add: 1 });
    expect(h.room().game!.complete()).toBe(true);
    h.send(h.a, h.pa.peer, "action", { add: 1 });
    expect(h.room().game!.project(0)).toMatchObject({ count: 2 });
  });
  test("generic rematch requires unanimous consent, recreates state and retains monotonic revisions/sequences", () => {
    const h = harness();
    h.send(h.a, h.pa.peer, "start");
    h.send(h.a, h.pa.peer, "rematch");
    expect(h.room().round).toBe(1);
    h.send(h.a, h.pa.peer, "action", { add: 1 });
    h.send(h.b, h.pb.peer, "action", { add: 1 });
    const revision = h.room().revision;
    h.send(h.a, h.pa.peer, "rematch");
    expect(h.room().round).toBe(1);
    h.send(h.b, h.pb.peer, "rematch");
    expect(h.room().round).toBe(2);
    expect(h.room().revision).toBeGreaterThan(revision);
    expect(h.room().game!.project(0)).toMatchObject({ count: 0 });
    h.send(h.a, h.pa.peer, "action", { add: 1 }, h.room().revision, 1);
    expect(h.room().game!.project(0)).toMatchObject({ count: 0 });
  });
  test("reconnect keeps identity/state; old socket cannot act or disconnect replacement", () => {
    const h = harness();
    h.send(h.a, h.pa.peer, "start");
    h.service.disconnect(h.a.code, h.a.playerId, h.pa.peer);
    const next = h.attach(h.a);
    h.service.disconnect(h.a.code, h.a.playerId, h.pa.peer);
    expect(h.room().players[0].peer).toBe(next.peer);
    expect(() => h.send(h.a, h.pa.peer, "action", { add: 1 })).toThrow("replaced");
    h.send(h.a, next.peer, "action", { add: 1 });
    expect(h.room().game!.project(0)).toMatchObject({ count: 1 });
  });
  test("rematch votes cannot leave a finished room stuck while a voter reconnects", () => {
    const h = harness();
    h.send(h.a, h.pa.peer, "start");
    h.send(h.a, h.pa.peer, "action", { add: 1 });
    h.send(h.b, h.pb.peer, "action", { add: 1 });
    h.send(h.a, h.pa.peer, "rematch");
    h.service.disconnect(h.a.code, h.a.playerId, h.pa.peer);
    h.send(h.b, h.pb.peer, "rematch");
    expect(h.room().players[1].rematch).toBe(false);
    h.attach(h.a);
    h.send(h.b, h.pb.peer, "rematch");
    expect(h.room().round).toBe(2);
  });
  test("a lost acknowledgement can be recovered on a replacement socket without a second update", () => {
    const h = harness();
    h.send(h.a, h.pa.peer, "start");
    const revision = h.room().revision;
    h.send(h.a, h.pa.peer, "action", { add: 1 });
    h.service.disconnect(h.a.code, h.a.playerId, h.pa.peer);
    const next = h.attach(h.a);
    h.send(h.a, next.peer, "action", { add: 1 }, revision, 2);
    expect(next.messages).toContainEqual({ type: "ack", sequence: 2, accepted: true });
    expect(h.room().game!.project(0)).toMatchObject({ count: 1 });
  });
  test("leave invalidates all credentials and tickets", () => {
    const h = harness();
    h.service.leave(h.a.code, h.a.playerId, h.a.credential);
    expect(h.service.store.size).toBe(0);
    expect(() => h.service.authorize(h.a.code, h.b.playerId, h.b.credential)).toThrow();
    expect(h.pb.closes).toContain(4000);
  });
  test("heartbeat, disconnect grace, idle and absolute expiration are enforced", () => {
    const h = harness();
    h.advance(45_001);
    h.service.cleanup();
    expect(h.pa.closes).toContain(4002);
    expect(h.room().players[0].peer).toBeUndefined();
    h.advance(120_001);
    h.service.cleanup();
    expect(h.service.store.size).toBe(0);
    for (const limits of [{ idleMs: 100 }, { lifetimeMs: 100 }]) {
      let now = 0;
      const s = new RoomService(games, new MemoryRoomStore(), () => now, limits);
      const a = s.create("shithead", {}, "A");
      now = 101;
      expect(() => s.authorize(a.code, a.playerId, a.credential)).toThrow("expired");
      expect(s.store.size).toBe(0);
    }
  });
  test("validation, capacity and per-player rate limits are bounded", () => {
    const h = harness();
    for (const name of ["", "x".repeat(33), "a\nb", "a\u202Eb"])
      expect(() => h.service.create("shithead", {}, name)).toThrow();
    for (const id of ["__proto__", "constructor", "unknown"])
      expect(() => h.service.create(id, {}, "A")).toThrow();
    expect(() => h.service.create("shithead", { unknown: true }, "A")).toThrow();
    expect(() => h.service.create("shithead", { voluntaryPickup: "yes" }, "A")).toThrow();
    for (const value of [null, [], {}, { type: "start", sequence: -1, revision: 1 }])
      expect(() => h.service.receive(h.a.code, h.a.playerId, h.pa.peer, value)).toThrow();
    for (let i = 0; i < 70; i++)
      h.service.receive(h.a.code, h.a.playerId, h.pa.peer, { type: "pong" });
    expect(() => {
      for (let i = 0; i < 20; i++)
        h.service.receive(h.a.code, h.a.playerId, h.pa.peer, { type: "pong" });
    }).toThrow("Too many");
    const capped = new RoomService(games, new MemoryRoomStore(), Date.now, { maxRooms: 1 });
    capped.create("shithead", {}, "A");
    expect(() => capped.create("shithead", {}, "B")).toThrow("full");
  });
});

describe("Shithead authority and projection", () => {
  test("two human seats can swap independently and ready; only creator chooses rules", () => {
    const h = harness("shithead", { playAgainAfterTwo: true });
    expect(() => h.service.join(h.a.code, "third")).toThrow();
    h.send(h.a, h.pa.peer, "start");
    for (const [seat, admission, peer] of [
      [0, h.a, h.pa.peer],
      [1, h.b, h.pb.peer],
    ] as const) {
      const before = h.room().game!.project(seat) as ReturnType<typeof shitheadAdapter.project>;
      h.send(admission, peer, "action", { kind: "swap", hand: 0, faceUp: 0 });
      const after = h.room().game!.project(seat) as typeof before;
      expect(after.players[seat].hand![0]).toEqual(before.players[seat].faceUp[0]);
      expect(after.rules.playAgainAfterTwo).toBe(true);
      h.send(admission, peer, "action", { kind: "ready" });
      h.send(admission, peer, "action", { kind: "swap", hand: 0, faceUp: 0 });
      expect((h.room().game!.project(seat) as typeof before).players[seat].hand).toEqual(
        after.players[seat].hand,
      );
    }
    expect(h.room().game!.project(0)).toMatchObject({ phase: "playing" });
  });
  test("projection omits hidden values/IDs for every seat throughout complete games with all rule combinations", () => {
    for (let variant = 0; variant < 8; variant++) {
      let state = shitheadAdapter.create(
        {
          voluntaryPickup: !!(variant & 1),
          playAgainAfterTwo: !!(variant & 2),
          revealUncovered: !!(variant & 4),
        },
        2,
      );
      state = shitheadAdapter.update(state, 0, { kind: "ready" });
      state = shitheadAdapter.update(state, 1, { kind: "ready" });
      let moves = 0;
      while (!shitheadAdapter.complete(state) && moves++ < 3000) {
        for (const seat of [0, 1]) {
          const view = shitheadAdapter.project(state, seat),
            serialized = JSON.stringify(view);
          expect(view.players[1 - seat].hand).toBeNull();
          expect(serialized).not.toContain('"stock":');
          expect(serialized).not.toContain('"faceDown":');
          const hidden = [
            ...state.game.stock,
            ...state.game.players[1 - seat].hand,
            ...state.game.players.flatMap((p) => p.faceDown),
          ];
          for (const card of hidden) {
            expect(serialized).not.toContain(JSON.stringify(card));
            expect(serialized).not.toContain(`"${cardId(card)}"`);
          }
        }
        state = { ...state, game: autoShithead(state.game) };
      }
      expect(shitheadAdapter.complete(state)).toBe(true);
    }
  });
  test("malformed actions, hidden-card IDs, wrong-turn and non-owned positions are rejected", () => {
    let state = shitheadAdapter.create(DEFAULT_SHITHEAD_RULES, 2);
    state = shitheadAdapter.update(state, 0, { kind: "ready" });
    state = shitheadAdapter.update(state, 1, { kind: "ready" });
    for (const action of [
      null,
      { kind: "play", indices: [0.5] },
      { kind: "play", indices: [-1] },
      { kind: "play", indices: ["A-Spades"] },
      { kind: "cheat" },
    ])
      expect(shitheadAdapter.parseAction(action)).toBeNull();
    for (const indices of [[999], [0, 0]])
      expect(shitheadAdapter.validate(state, state.game.turn, { kind: "play", indices })).toBe(
        false,
      );
    expect(
      shitheadAdapter.validate(state, 1 - state.game.turn, { kind: "play", indices: [0] }),
    ).toBe(false);
  });
});

test("client server URL enforces HTTPS with loopback-only development exceptions", () => {
  expect(serverUrl("https://cards.example")).toBe("https://cards.example");
  expect(serverUrl("http://127.0.0.1:8787")).toBe("http://127.0.0.1:8787");
  for (const url of [
    "http://cards.example",
    "https://user:secret@cards.example",
    "https://cards.example/a",
    "https://cards.example?token=x",
  ])
    expect(() => serverUrl(url)).toThrow();
});

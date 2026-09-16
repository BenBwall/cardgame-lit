import { expect, test } from "bun:test";
import { type Card, cardId } from "@cardgame/cards.js";
import {
  type ShitheadPlayer,
  type ShitheadState,
  DEFAULT_SHITHEAD_RULES,
  canPickupShithead,
  shitheadSlots,
  autoShithead,
  canPlayShithead,
  newShithead,
  pickupShithead,
  playShithead,
  startShithead,
  swapShithead,
} from "@cardgame/shithead-state.js";

const card = (rank: Card["rank"], suit: Card["suit"] = "Clubs"): Card => ({ rank, suit });
const player = (
  hand: Card[] = [],
  faceUp: Card[] = [],
  faceDown: Card[] = [card("5", "Spades")],
): ShitheadPlayer => ({ hand, faceUp, faceDown });
const fixture = (you: ShitheadPlayer, pile: Card[] = [], stock: Card[] = []): ShitheadState => ({
  rules: DEFAULT_SHITHEAD_RULES,
  players: [you, player([card("K", "Hearts")])],
  stock,
  pile,
  burned: [],
  phase: "playing",
  turn: 0,
  winner: null,
  message: "",
});
const allCards = (state: ShitheadState) => [
  ...state.stock,
  ...state.pile,
  ...state.burned,
  ...state.players.flatMap((p) => [...p.hand, ...p.faceUp, ...p.faceDown]),
];

test("deals all 52 unique cards, three per zone, and swaps only before play", () => {
  const state = newShithead(() => 0.5);
  expect(state.stock).toHaveLength(34);
  for (const p of state.players)
    for (const zone of [p.hand, p.faceUp, p.faceDown]) expect(zone).toHaveLength(3);
  expect(new Set(allCards(state).map(cardId)).size).toBe(52);
  const hand = state.players[0].hand[0],
    up = state.players[0].faceUp[1];
  const swapped = swapShithead(state, cardId(hand), cardId(up));
  expect(swapped.players[0].hand[0]).toEqual(up);
  expect(swapped.players[0].faceUp[1]).toEqual(hand);
  expect(state.players[0].hand[0]).toEqual(hand);
  const started = startShithead(swapped);
  expect(started.turn).toBe(state.turn);
  expect(swapShithead(started, cardId(up), cardId(hand))).toBe(started);
});

test("aces high, equal ranks legal, 2 resets and 10 is always legal", () => {
  expect(canPlayShithead(card("K"), [card("A")])).toBe(false);
  expect(canPlayShithead(card("A"), [card("K")])).toBe(true);
  expect(canPlayShithead(card("4"), [card("4")])).toBe(true);
  for (const rank of ["2", "10"] as const)
    expect(canPlayShithead(card(rank), [card("A")])).toBe(true);
  expect(canPlayShithead(card("3"), [card("2")])).toBe(true);
});

test("rejects wrong turns, illegal cards, mixed sets and malformed indices without mutation", () => {
  const state = fixture(player([card("4"), card("5")]), [card("6")]);
  for (const indices of [[0], [0, 1], [0, 0], [-1], [2], [NaN], [0.5], []])
    expect(playShithead(state, 0, indices)).toBe(state);
  expect(playShithead(state, 1, [0])).toBe(state);
  expect(pickupShithead(state, 1)).toBe(state);
});

test("plays matching sets and refills before changing turns, including partial stock", () => {
  const state = fixture(
    player([card("4"), card("4", "Hearts"), card("8")]),
    [],
    [card("J"), card("Q")],
  );
  const next = playShithead(state, 0, [0, 1]);
  expect(next.players[0].hand.map((c) => c.rank)).toEqual(["8", "Q", "J"]);
  expect(next.pile).toHaveLength(2);
  expect(next.turn).toBe(1);
  expect(state.stock).toHaveLength(2);
  const partial = playShithead(fixture(player([card("4")]), [], [card("Q")]), 0, [0]);
  expect(partial.players[0].hand).toHaveLength(1);
  expect(partial.stock).toHaveLength(0);
});

test("10 and consecutive quartets burn the pile and keep the turn", () => {
  for (const [hand, pile] of [
    [[card("10")], [card("A")]],
    [[card("4", "Spades")], [card("4"), card("4", "Hearts"), card("4", "Diamonds")]],
    [[card("4"), card("4", "Hearts"), card("4", "Diamonds"), card("4", "Spades")], []],
  ]) {
    const state = fixture(player(hand), pile);
    const next = playShithead(
      state,
      0,
      hand.map((_, i) => i),
    );
    expect(next.pile).toHaveLength(0);
    expect(next.burned).toHaveLength(hand.length + pile.length);
    expect(next.turn).toBe(0);
  }
});

test("voluntary pickup ends the turn and keeps table cards", () => {
  const state = fixture(player([card("A")], [card("2")]), [card("3")]);
  const next = pickupShithead(state, 0);
  expect(next.players[0].hand).toHaveLength(2);
  expect(next.players[0].faceUp).toEqual(state.players[0].faceUp);
  expect(next.turn).toBe(1);
  expect(pickupShithead(fixture(player()), 0).pile).toEqual([]);
});

test("endgame gates table cards and failed blind play includes revealed card in pickup", () => {
  const state = fixture(player([], [card("8")], [card("3")]), [card("7")]);
  const up = playShithead(state, 0, [0]);
  expect(up.players[0].faceUp).toHaveLength(0);
  expect(up.players[0].faceDown).toHaveLength(1);
  const down = playShithead({ ...up, turn: 0 }, 0, [0]);
  expect(down.players[0].hand.map((c) => c.rank)).toEqual(["7", "8", "3"]);
  expect(down.players[0].faceDown).toHaveLength(0);
  expect(down.phase).toBe("playing");
  expect(down.pile).toHaveLength(0);
  const failedUp = fixture(player([], [card("3")]), [card("8")]);
  expect(playShithead(failedUp, 0, [0])).toBe(failedUp);
});

test("last blind card wins, including a burn, but drawing stock prevents finishing", () => {
  for (const rank of ["A", "10"] as const) {
    const next = playShithead(fixture(player([], [], [card(rank)])), 0, [0]);
    expect(next.winner).toBe(0);
    expect(next.phase).toBe("finished");
    expect(playShithead(next, 1, [0])).toBe(next);
    expect(pickupShithead(next, 1)).toBe(next);
  }
  const next = playShithead(fixture(player([card("10")], [], []), [], [card("5")]), 0, [0]);
  expect(next.phase).toBe("playing");
  expect(next.players[0].hand).toHaveLength(1);
});

test("100 seeded bot games terminate and conserve each card through every move", () => {
  for (let seed = 1; seed <= 100; seed++) {
    let value = seed;
    const random = () => {
      value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
      return value / 2 ** 32;
    };
    let state = startShithead(newShithead(random));
    let moves = 0;
    while (state.phase === "playing" && moves++ < 2000) {
      const next = autoShithead(state);
      expect(next).not.toBe(state);
      expect(allCards(next)).toHaveLength(52);
      expect(new Set(allCards(next).map(cardId)).size).toBe(52);
      state = next;
    }
    expect(state.phase).toBe("finished");
  }
});

test("disabling voluntary pickup requires a legal play or a blind attempt", () => {
  const restrict = (state: ShitheadState): ShitheadState => ({
    ...state,
    rules: { ...state.rules, voluntaryPickup: false },
  });
  for (const you of [
    player([card("A")]),
    player([], [card("A")]),
    player([], [], [card("3")]),
    player([], [], [card("A")]),
  ]) {
    const state = restrict(fixture(you, [card("K")]));
    expect(canPickupShithead(state, 0)).toBe(false);
    expect(pickupShithead(state, 0)).toBe(state);
  }
  for (const you of [player([card("3")]), player([], [card("3")])]) {
    const state = restrict(fixture(you, [card("K")]));
    expect(canPickupShithead(state, 0)).toBe(true);
    expect(pickupShithead(state, 0).pile).toHaveLength(0);
  }
  const blind = restrict(fixture(player([], [], [card("3")]), [card("K")]));
  expect(playShithead(blind, 0, [0]).players[0].hand).toHaveLength(2);
});

test("optional extra turn after 2 refills first, supports sets and applies to the computer", () => {
  const base = fixture(
    player([card("2"), card("2", "Hearts")]),
    [card("A")],
    [card("Q"), card("K")],
  );
  expect(playShithead(base, 0, [0, 1]).turn).toBe(1);
  const state = { ...base, rules: { ...base.rules, playAgainAfterTwo: true } };
  const next = playShithead(state, 0, [0, 1]);
  expect(next.turn).toBe(0);
  expect(next.players[0].hand).toHaveLength(2);
  expect(next.pile).toHaveLength(3);
  expect(next.burned).toHaveLength(0);
  const computer = autoShithead({
    ...state,
    turn: 1,
    players: [state.players[1], state.players[0]],
  });
  expect(computer.turn).toBe(1);
  const last = playShithead(
    { ...fixture(player([], [], [card("2")])), rules: state.rules },
    0,
    [0],
  );
  expect(last.phase).toBe("finished");
});

test("revealing uncovered cards preserves pairs through swaps and nonadjacent plays", () => {
  const up = [card("4"), card("5"), card("6")];
  const down = [card("J"), card("Q"), card("K")];
  let state = {
    ...fixture(player([], up, down)),
    rules: { ...DEFAULT_SHITHEAD_RULES, revealUncovered: true },
  };
  const first = playShithead(state, 0, [1]);
  expect(first.players[0].faceUp.map(cardId)).toEqual([
    cardId(up[0]),
    cardId(up[2]),
    cardId(down[1]),
  ]);
  expect(shitheadSlots(first.players[0])[1]).toEqual({ faceUp: cardId(down[1]), faceDown: null });
  expect(first.players[0].faceDown).toEqual([down[0], down[2]]);
  const second = playShithead({ ...first, turn: 0, pile: [] }, 0, [0]);
  expect(shitheadSlots(second.players[0])[0]).toEqual({ faceUp: cardId(down[0]), faceDown: null });
  expect(second.players[0].faceDown).toEqual([down[2]]);
  const hidden = playShithead({ ...state, rules: DEFAULT_SHITHEAD_RULES }, 0, [1]);
  expect(hidden.players[0].faceDown).toEqual(down);
  expect(shitheadSlots(hidden.players[0])[1]).toEqual({ faceUp: null, faceDown: cardId(down[1]) });
  const setup = {
    ...state,
    phase: "setup" as const,
    players: [player([card("10")], up, down), state.players[1]] as const,
  };
  const swapped = swapShithead(setup, cardId(card("10")), cardId(up[1]));
  expect(shitheadSlots(swapped.players[0])[1].faceUp).toBe(cardId(card("10")));
  const reveal = playShithead(
    {
      ...startShithead(swapped),
      players: [{ ...swapped.players[0], hand: [] }, swapped.players[1]],
    },
    0,
    [1],
  );
  expect(reveal.players[0].faceUp).toContainEqual(down[1]);
  expect(reveal.turn).toBe(0);
  expect(state.players[0].faceDown).toEqual(down);
});

test("matching upcards reveal all their lower cards and prevent premature game completion", () => {
  const base = fixture(player([], [card("10"), card("10", "Hearts")], [card("3"), card("4")]));
  const state = { ...base, rules: { ...base.rules, revealUncovered: true } };
  const next = playShithead(state, 0, [0, 1]);
  expect(next.players[0].faceDown).toHaveLength(0);
  expect(next.players[0].faceUp.map((card) => card.rank)).toEqual(["3", "4"]);
  expect(next.phase).toBe("playing");
  expect(next.turn).toBe(0);
  const blocked = { ...next, pile: [card("A")] };
  expect(playShithead(blocked, 0, [0])).toBe(blocked);
  expect(pickupShithead(blocked, 0).players[0].faceUp).toEqual(next.players[0].faceUp);
});

test("all eight rule combinations finish seeded games without losing cards or table positions", () => {
  for (let combination = 0; combination < 8; combination++)
    for (let seed = 1; seed <= 30; seed++) {
      let value = seed;
      const random = () => {
        value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
        return value / 2 ** 32;
      };
      let state = startShithead(
        newShithead(random, {
          voluntaryPickup: !!(combination & 1),
          playAgainAfterTwo: !!(combination & 2),
          revealUncovered: !!(combination & 4),
        }),
      );
      let moves = 0;
      while (state.phase === "playing" && moves++ < 2000) {
        const next = autoShithead(state);
        expect(next).not.toBe(state);
        expect(allCards(next)).toHaveLength(52);
        expect(new Set(allCards(next).map(cardId)).size).toBe(52);
        for (const p of next.players)
          for (const source of ["faceUp", "faceDown"] as const)
            expect(
              shitheadSlots(p)
                .flatMap((slot) => (slot[source] ? [slot[source]] : []))
                .sort(),
            ).toEqual(p[source].map(cardId).sort());
        state = next;
      }
      expect(state.phase).toBe("finished");
    }
});

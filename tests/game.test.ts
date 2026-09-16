import { describe, expect, test } from "bun:test";
import { cardId, createDeck, shuffle, sortCards } from "../src/cards.js";
import { drawCard, handCards, newGame, playCard, reorderHand } from "../src/game-state.js";

describe("local card table", () => {
  test("reordering preserves every card, immutable snapshots, and original draw order", () => {
    let state = newGame();
    for (let index = 0; index < 5; index++) state = drawCard(state);
    const ids = state.hand.map(cardId);
    const reordered = reorderHand(state, ids[0], 4, "draw-order");
    expect(handCards(reordered, "manual").map(cardId)).toEqual([...ids.slice(1), ids[0]]);
    expect(reordered.deck).toBe(state.deck);
    expect(reordered.played).toBe(state.played);
    expect(reordered.hand).toBe(state.hand);
    expect(state.handOrder).toEqual(ids);
    expect(handCards(reordered, "draw-order").map(cardId)).toEqual(ids);
    expect(reorderHand(reordered, ids[0], 0, "manual").handOrder).toEqual(ids);
  });

  test("a drag starts from the displayed sort and manual order survives draw and play", () => {
    let state = newGame();
    for (let index = 0; index < 5; index++) state = drawCard(state);
    const sorted = handCards(state, "rank-then-suit").map(cardId);
    const reordered = reorderHand(state, sorted[0], 4, "rank-then-suit");
    const drawn = drawCard(reordered);
    expect(handCards(drawn, "manual").map(cardId)).toEqual([
      ...sorted.slice(1),
      sorted[0],
      cardId(drawn.hand[5]),
    ]);
    const played = playCard(drawn, sorted[2]);
    expect(played.handOrder).toEqual(drawn.handOrder.filter((id) => id !== sorted[2]));
    expect(new Set([...played.deck, ...played.hand, ...played.played].map(cardId)).size).toBe(52);
    expect(played.handOrder).toHaveLength(played.hand.length);
  });

  test("invalid and no-op drops do not change state or create history entries", () => {
    const state = drawCard(newGame());
    const id = cardId(state.hand[0]);
    for (const destination of [-1, 1, 0.5, NaN, Infinity, 0])
      expect(reorderHand(state, id, destination, "draw-order")).toBe(state);
    expect(reorderHand(state, "unknown", 0, "manual")).toBe(state);
    expect(reorderHand(newGame(), id, 0, "manual").hand).toEqual([]);
  });

  test("starts with 52 unique cards and no shared instance state", () => {
    const first = newGame();
    const second = newGame();
    expect(new Set(first.deck.map(cardId)).size).toBe(52);
    expect(first.hand).toEqual([]);
    expect(first.played).toEqual([]);
    expect(first.deck).not.toBe(second.deck);
    drawCard(first);
    expect(second.deck).toHaveLength(52);
  });

  test("shuffle is non-mutating and preserves the entire deck", () => {
    const deck = createDeck();
    const result = shuffle(deck, () => 0);
    expect(result).not.toEqual(deck);
    expect(result.map(cardId).sort()).toEqual(deck.map(cardId).sort());
    expect(deck).toEqual(createDeck());
  });

  test("draw and play preserve cards and immutable undo snapshots", () => {
    const original = newGame(() => 0.5);
    const drawn = drawCard(original);
    const card = drawn.hand[0];
    const played = playCard(drawn, cardId(card));
    expect(original.deck).toHaveLength(52);
    expect(original.hand).toHaveLength(0);
    expect(drawn.deck).toHaveLength(51);
    expect(drawn.hand).toEqual([card]);
    expect(played.hand).toHaveLength(0);
    expect(played.played).toEqual([card]);
    expect(new Set([...played.deck, ...played.hand, ...played.played].map(cardId)).size).toBe(52);
    expect(playCard(played, cardId(card))).toBe(played);
    expect(playCard(drawn, "invalid")).toBe(drawn);
  });

  test("deck exhaustion and a complete game have no lost or duplicated cards", () => {
    let game = newGame();
    for (let index = 0; index < 52; index++) game = drawCard(game);
    expect(game.deck).toHaveLength(0);
    expect(game.hand).toHaveLength(52);
    expect(drawCard(game)).toBe(game);
    for (const card of game.hand) game = playCard(game, cardId(card));
    expect(game.hand).toHaveLength(0);
    expect(game.played).toHaveLength(52);
    expect(new Set(game.played.map(cardId)).size).toBe(52);
  });

  test("sorting preserves original draw order and uses ace-low, original suit order", () => {
    const cards = createDeck().filter((card) => ["K", "2", "A"].includes(card.rank));
    const original = [...cards];
    const byRank = sortCards(cards, "rank-then-suit");
    expect(byRank.slice(0, 4).map(cardId)).toEqual([
      "A-Hearts",
      "A-Diamonds",
      "A-Spades",
      "A-Clubs",
    ]);
    expect(byRank.at(-1)?.rank).toBe("K");
    expect(sortCards(cards, "suit-then-rank").slice(0, 3).map(cardId)).toEqual([
      "A-Hearts",
      "2-Hearts",
      "K-Hearts",
    ]);
    expect(sortCards(cards, "draw-order")).toEqual(original);
    expect(cards).toEqual(original);
  });
});

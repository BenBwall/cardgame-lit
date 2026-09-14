import { describe, expect, test } from "bun:test";
import { cardId, createDeck, shuffle, sortCards } from "../src/cards.js";
import { drawCard, newGame, playCard } from "../src/game-state.js";

describe("local card table", () => {
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

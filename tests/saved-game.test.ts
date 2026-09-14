import { expect, test } from "bun:test";
import { newGame, drawCard, playCard } from "../src/game-state.js";
import { cardId } from "../src/cards.js";
import { newShithead, startShithead, autoShithead } from "../src/shithead-state.js";
import { isFreeGame, isShitheadGame, isSortOrder, isRules } from "../src/saved-game.js";

test("free-play saves require a full unique deck and a valid hand order", () => {
  const game = drawCard(newGame());
  expect(isFreeGame(JSON.parse(JSON.stringify(game)))).toBe(true);
  expect(isFreeGame(playCard(game, cardId(game.hand[0])))).toBe(true);
  expect(isFreeGame({ ...game, deck: game.deck.slice(1) })).toBe(false);
  expect(isFreeGame({ ...game, handOrder: ["missing"] })).toBe(false);
  expect(isFreeGame({ ...game, played: game.hand })).toBe(false);
  expect(isFreeGame({ ...game, hand: [{ rank: "99", suit: "Spades" }] })).toBe(false);
});

test("Shithead saves reject corrupt cards, phases, rules and table references", () => {
  const game = newShithead();
  expect(isShitheadGame(JSON.parse(JSON.stringify(game)))).toBe(true);
  for (const invalid of [
    null,
    {},
    { ...game, turn: 4 },
    { ...game, phase: "unknown" },
    { ...game, rules: {} },
    { ...game, winner: 0 },
    { ...game, phase: "finished", winner: 0 },
    { ...game, stock: game.stock.slice(1) },
    { ...game, pile: [game.stock[0]] },
    {
      ...game,
      players: [
        { ...game.players[0], tableSlots: [{ faceUp: "missing", faceDown: null }] },
        game.players[1],
      ],
    },
  ])
    expect(isShitheadGame(invalid)).toBe(false);
  expect(isSortOrder("manual")).toBe(true);
  expect(isSortOrder("other")).toBe(false);
  expect(isRules({ ...game.rules, voluntaryPickup: "yes" })).toBe(false);
});

test("every game phase survives JSON save validation for all rule combinations", () => {
  for (let combination = 0; combination < 8; combination++) {
    let seed = combination + 1;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    let state = newShithead(random, {
      voluntaryPickup: !!(combination & 1),
      playAgainAfterTwo: !!(combination & 2),
      revealUncovered: !!(combination & 4),
    });
    expect(isShitheadGame(state)).toBe(true);
    state = startShithead(state);
    let moves = 0;
    while (state.phase === "playing" && moves++ < 2000) {
      state = autoShithead(state);
      expect(isShitheadGame(JSON.parse(JSON.stringify(state)))).toBe(true);
    }
    expect(state.phase).toBe("finished");
  }
});

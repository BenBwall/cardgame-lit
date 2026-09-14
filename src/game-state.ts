import { type Card, type SortOrder, cardId, createDeck, shuffle, sortCards } from "./cards.js";

export type GameState = Readonly<{
  deck: readonly Card[];
  hand: readonly Card[];
  handOrder: readonly string[];
  played: readonly Card[];
}>;

export const newGame = (random = Math.random): GameState => ({
  deck: shuffle(createDeck(), random),
  hand: [],
  handOrder: [],
  played: [],
});

export const drawCard = (state: GameState): GameState => {
  const card = state.deck.at(-1);
  if (!card) return state;
  return {
    ...state,
    deck: state.deck.slice(0, -1),
    hand: [...state.hand, card],
    handOrder: [...state.handOrder, cardId(card)],
  };
};

export const playCard = (state: GameState, id: string): GameState => {
  const card = state.hand.find((value) => cardId(value) === id);
  if (!card) return state;
  return {
    ...state,
    hand: state.hand.filter((value) => cardId(value) !== id),
    handOrder: state.handOrder.filter((value) => value !== id),
    played: [...state.played, card],
  };
};

export const handCards = (state: GameState, order: SortOrder): Card[] =>
  order === "manual"
    ? [...state.hand].sort(
        (a, b) => state.handOrder.indexOf(cardId(a)) - state.handOrder.indexOf(cardId(b)),
      )
    : sortCards(state.hand, order);

/** Move within the displayed order, preserving the original draw order and other piles. */
export const reorderHand = (
  state: GameState,
  id: string,
  destination: number,
  order: SortOrder,
): GameState => {
  const cards = handCards(state, order);
  const source = cards.findIndex((card) => cardId(card) === id);
  if (
    source < 0 ||
    !Number.isInteger(destination) ||
    destination < 0 ||
    destination >= cards.length ||
    source === destination
  )
    return state;
  const [card] = cards.splice(source, 1);
  cards.splice(destination, 0, card);
  return { ...state, handOrder: cards.map(cardId) };
};

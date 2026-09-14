import { type Card, cardId, createDeck, shuffle } from "./cards.js";

export type GameState = Readonly<{
  deck: readonly Card[];
  hand: readonly Card[];
  played: readonly Card[];
}>;

export const newGame = (random = Math.random): GameState => ({
  deck: shuffle(createDeck(), random),
  hand: [],
  played: [],
});

export const drawCard = (state: GameState): GameState => {
  const card = state.deck.at(-1);
  if (!card) return state;
  return { ...state, deck: state.deck.slice(0, -1), hand: [...state.hand, card] };
};

export const playCard = (state: GameState, id: string): GameState => {
  const card = state.hand.find((value) => cardId(value) === id);
  if (!card) return state;
  return {
    ...state,
    hand: state.hand.filter((value) => cardId(value) !== id),
    played: [...state.played, card],
  };
};

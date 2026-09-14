export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;
export const SUITS = ["Clubs", "Diamonds", "Hearts", "Spades"] as const;
export type Card = Readonly<{ rank: (typeof RANKS)[number]; suit: (typeof SUITS)[number] }>;
export type SortOrder = "draw-order" | "rank-then-suit" | "suit-then-rank";
export const SUIT_SYMBOLS = { Clubs: "♣", Diamonds: "♦", Hearts: "♥", Spades: "♠" } as const;
const suitOrder: Card["suit"][] = ["Hearts", "Diamonds", "Spades", "Clubs"];

export const cardId = (card: Card): string => `${card.rank}-${card.suit}`;
export const cardName = (card: Card): string => `${card.rank} of ${card.suit}`;
export const createDeck = (): Card[] =>
  SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit })));

export const shuffle = (cards: readonly Card[], random = Math.random): Card[] => {
  const result = [...cards];
  for (let index = result.length - 1; index > 0; index--) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
};

export const sortCards = (cards: readonly Card[], order: SortOrder): Card[] => {
  if (order === "draw-order") return [...cards];
  return [...cards].sort((a, b) => {
    const rank = RANKS.indexOf(a.rank) - RANKS.indexOf(b.rank);
    const suit = suitOrder.indexOf(a.suit) - suitOrder.indexOf(b.suit);
    return order === "rank-then-suit" ? rank || suit : suit || rank;
  });
};

import { type Card, RANKS, cardId, cardName, createDeck, shuffle } from "./cards.js";

export type ShitheadRules = Readonly<{
  voluntaryPickup: boolean;
  playAgainAfterTwo: boolean;
  revealUncovered: boolean;
}>;
export const DEFAULT_SHITHEAD_RULES: ShitheadRules = Object.freeze({
  voluntaryPickup: true,
  playAgainAfterTwo: false,
  revealUncovered: false,
});
export type ShitheadSlot = Readonly<{ faceUp: string | null; faceDown: string | null }>;
export type ShitheadPlayer = Readonly<{
  hand: readonly Card[];
  faceUp: readonly Card[];
  faceDown: readonly Card[];
  tableSlots?: readonly ShitheadSlot[];
}>;
export type ShitheadState = Readonly<{
  rules: ShitheadRules;
  players: readonly [ShitheadPlayer, ShitheadPlayer];
  stock: readonly Card[];
  pile: readonly Card[];
  burned: readonly Card[];
  phase: "setup" | "playing" | "finished";
  turn: number;
  winner: number | null;
  message: string;
}>;
export type ShitheadSource = "hand" | "faceUp" | "faceDown";
export const shitheadRank = (card: Card): number =>
  card.rank === "A" ? 14 : RANKS.indexOf(card.rank) + 1;
export const canPlayShithead = (card: Card, pile: readonly Card[]): boolean => {
  const top = pile.at(-1);
  return (
    !top ||
    card.rank === "2" ||
    card.rank === "10" ||
    top.rank === "2" ||
    shitheadRank(card) >= shitheadRank(top)
  );
};
export const shitheadSource = (player: ShitheadPlayer): ShitheadSource =>
  player.hand.length ? "hand" : player.faceUp.length ? "faceUp" : "faceDown";

/** Fixed table positions keep each lower card paired with its original cover. */
export const shitheadSlots = (player: ShitheadPlayer): readonly ShitheadSlot[] =>
  player.tableSlots ??
  Array.from({ length: Math.max(player.faceUp.length, player.faceDown.length) }, (_, index) => ({
    faceUp: player.faceUp[index] ? cardId(player.faceUp[index]) : null,
    faceDown: player.faceDown[index] ? cardId(player.faceDown[index]) : null,
  }));

export const canPickupShithead = (state: ShitheadState, actor: number): boolean => {
  if (state.phase !== "playing" || state.turn !== actor || !state.pile.length) return false;
  if (state.rules.voluntaryPickup) return true;
  const player = state.players[actor];
  const source = shitheadSource(player);
  // A blind card must be attempted; never inspect it to decide whether pickup is allowed.
  return source !== "faceDown" && !player[source].some((card) => canPlayShithead(card, state.pile));
};

// Prefer saving wild cards and high ranks for the exposed endgame.
const strength = (card: Card): number =>
  card.rank === "10" ? 16 : card.rank === "2" ? 15 : shitheadRank(card);

export function newShithead(
  random = Math.random,
  rules: ShitheadRules = DEFAULT_SHITHEAD_RULES,
): ShitheadState {
  const stock = shuffle(createDeck(), random);
  const players = [0, 1].map(() => ({
    hand: [] as Card[],
    faceUp: [] as Card[],
    faceDown: [] as Card[],
  }));
  for (const zone of ["faceDown", "faceUp", "hand"] as const)
    for (let round = 0; round < 3; round++)
      for (const player of players) player[zone].push(stock.pop()!);
  // First dealt upcard of the lowest starting rank, then hand declarations.
  let turn = 0;
  outer: for (const rank of ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"]) {
    for (const zone of ["faceUp", "hand"] as const) {
      for (let round = 0; round < 3; round++) {
        const index = players.findIndex((player) => player[zone][round].rank === rank);
        if (index >= 0) {
          turn = index;
          break outer;
        }
      }
    }
  }
  const opponent = [...players[1].hand, ...players[1].faceUp].sort(
    (a, b) => strength(a) - strength(b),
  );
  players[1] = { ...players[1], hand: opponent.slice(0, 3), faceUp: opponent.slice(3) };
  return {
    rules: { ...rules },
    players: [
      { ...players[0], tableSlots: shitheadSlots(players[0]) },
      { ...players[1], tableSlots: shitheadSlots(players[1]) },
    ],
    stock,
    pile: [],
    burned: [],
    phase: "setup",
    turn,
    winner: null,
    message: "Swap a hand card with a face-up card, or start when ready.",
  };
}

export function swapShithead(state: ShitheadState, handId: string, upId: string): ShitheadState {
  if (state.phase !== "setup") return state;
  const player = state.players[0];
  const handIndex = player.hand.findIndex((card) => cardId(card) === handId);
  const upIndex = player.faceUp.findIndex((card) => cardId(card) === upId);
  if (handIndex < 0 || upIndex < 0) return state;
  const hand = [...player.hand],
    faceUp = [...player.faceUp];
  [hand[handIndex], faceUp[upIndex]] = [faceUp[upIndex], hand[handIndex]];
  const tableSlots = shitheadSlots(player).map((slot) =>
    slot.faceUp === upId ? { ...slot, faceUp: handId } : slot,
  );
  return {
    ...state,
    players: [{ ...player, hand, faceUp, tableSlots }, state.players[1]],
    message: "Cards swapped. Swap again or start the game.",
  };
}

export const startShithead = (state: ShitheadState): ShitheadState =>
  state.phase !== "setup"
    ? state
    : {
        ...state,
        phase: "playing",
        message:
          state.turn === 0 ? "You start. Play any card or matching set." : "Computer starts.",
      };

function advance(
  state: ShitheadState,
  player: ShitheadPlayer,
  pile: readonly Card[],
  stock: readonly Card[],
  burned: readonly Card[],
  again: boolean,
  message: string,
): ShitheadState {
  const players: [ShitheadPlayer, ShitheadPlayer] = [...state.players];
  players[state.turn] = player;
  const finished =
    !stock.length && !player.hand.length && !player.faceUp.length && !player.faceDown.length;
  return {
    ...state,
    players,
    pile,
    stock,
    burned,
    turn: again && !finished ? state.turn : 1 - state.turn,
    phase: finished ? "finished" : "playing",
    winner: finished ? state.turn : null,
    message: finished
      ? `${message} ${state.turn === 0 ? "You are out! Computer is the Shithead." : "Computer is out. You are the Shithead. Try again!"}`
      : `${message} ${again ? "Play again." : state.turn === 0 ? "Computer’s turn." : "Your turn."}`,
  };
}

export function pickupShithead(state: ShitheadState, actor: number): ShitheadState {
  if (!canPickupShithead(state, actor)) return state;
  const player = state.players[actor];
  return advance(
    state,
    { ...player, hand: [...player.hand, ...state.pile] },
    [],
    state.stock,
    state.burned,
    false,
    `${actor === 0 ? "You" : "Computer"} picked up ${state.pile.length} cards.`,
  );
}

/** Blind cards are addressed by position; their values never enter the UI or bot decision. */
export function playShithead(
  state: ShitheadState,
  actor: number,
  indices: readonly number[],
): ShitheadState {
  if (
    state.phase !== "playing" ||
    state.turn !== actor ||
    !indices.length ||
    new Set(indices).size !== indices.length
  )
    return state;
  const player = state.players[actor];
  const source = shitheadSource(player);
  const available = player[source];
  if (indices.some((index) => !Number.isInteger(index) || index < 0 || index >= available.length))
    return state;
  const cards = indices.map((index) => available[index]);
  if (
    source === "faceDown" ? cards.length !== 1 : cards.some((card) => card.rank !== cards[0].rank)
  )
    return state;
  const legal = canPlayShithead(cards[0], state.pile);
  if (!legal && source !== "faceDown") return state;
  const remaining = available.filter((_, index) => !indices.includes(index));
  let nextPlayer: ShitheadPlayer = { ...player, [source]: remaining };
  if (source !== "hand") {
    const playedIds = new Set(cards.map(cardId));
    const revealed: Card[] = [];
    const tableSlots = shitheadSlots(player).map((slot) => {
      if (source === "faceDown")
        return slot.faceDown && playedIds.has(slot.faceDown) ? { ...slot, faceDown: null } : slot;
      if (!slot.faceUp || !playedIds.has(slot.faceUp)) return slot;
      const lower = state.rules.revealUncovered
        ? player.faceDown.find((card) => cardId(card) === slot.faceDown)
        : undefined;
      if (lower) revealed.push(lower);
      return { faceUp: lower ? cardId(lower) : null, faceDown: lower ? null : slot.faceDown };
    });
    nextPlayer = {
      ...nextPlayer,
      tableSlots,
      faceUp: [...nextPlayer.faceUp, ...revealed],
      faceDown: nextPlayer.faceDown.filter((card) => !revealed.includes(card)),
    };
  }
  const pile = [...state.pile, ...cards];
  const who = actor === 0 ? "You" : "Computer";
  if (!legal)
    return advance(
      state,
      { ...nextPlayer, hand: [...nextPlayer.hand, ...pile] },
      [],
      state.stock,
      state.burned,
      false,
      `${who} revealed ${cardName(cards[0])} and picked up ${pile.length} cards.`,
    );
  const stock = [...state.stock];
  const hand = [...nextPlayer.hand];
  while (hand.length < 3 && stock.length) hand.push(stock.pop()!);
  const burn =
    cards[0].rank === "10" ||
    (pile.length >= 4 && pile.slice(-4).every((card) => card.rank === cards[0].rank));
  return advance(
    state,
    { ...nextPlayer, hand },
    burn ? [] : pile,
    stock,
    burn ? [...state.burned, ...pile] : state.burned,
    burn || (state.rules.playAgainAfterTwo && cards[0].rank === "2"),
    `${who} played ${cards.map(cardName).join(", ")}.${burn ? " Pile burned!" : ""}`,
  );
}

/** Also usable for deterministic simulations; only looks at the active player's visible cards. */
export function autoShithead(state: ShitheadState): ShitheadState {
  if (state.phase !== "playing") return state;
  const player = state.players[state.turn];
  const source = shitheadSource(player);
  if (source === "faceDown") return playShithead(state, state.turn, [0]);
  const legal = player[source]
    .filter((card) => canPlayShithead(card, state.pile))
    .sort((a, b) => strength(a) - strength(b));
  if (!legal.length) return pickupShithead(state, state.turn);
  return playShithead(
    state,
    state.turn,
    player[source].flatMap((card, index) => (card.rank === legal[0].rank ? [index] : [])),
  );
}

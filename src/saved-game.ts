import { type Card, type SortOrder, RANKS, SUITS, cardId } from "@cardgame/cards.js";
import type { GameState } from "@cardgame/game-state.js";
import type { ShitheadState, ShitheadRules } from "@cardgame/shithead-state.js";

type RecordValue = Record<string, unknown>;
export const record = (value: unknown): value is RecordValue =>
  !!value && typeof value === "object" && !Array.isArray(value);
const card = (value: unknown): value is Card =>
  record(value) &&
  RANKS.some((rank) => rank === value.rank) &&
  SUITS.some((suit) => suit === value.suit);
const cards = (value: unknown): value is Card[] =>
  Array.isArray(value) && value.length <= 52 && value.every(card);
const ids = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.every((id) => typeof id === "string") &&
  new Set(value).size === value.length;
const wholeDeck = (cards: readonly Card[]) =>
  cards.length === 52 && new Set(cards.map(cardId)).size === 52;
const matches = (values: readonly string[], cards: readonly Card[]) =>
  values.length === cards.length && cards.every((card) => values.includes(cardId(card)));
export const isSortOrder = (value: unknown): value is SortOrder =>
  ["draw-order", "rank-then-suit", "suit-then-rank", "manual"].includes(value as string);
export const isRules = (value: unknown): value is ShitheadRules =>
  record(value) &&
  ["voluntaryPickup", "playAgainAfterTwo", "revealUncovered"].every(
    (key) => typeof value[key] === "boolean",
  );
export function isFreeGame(value: unknown): value is GameState {
  return (
    record(value) &&
    cards(value.deck) &&
    cards(value.hand) &&
    cards(value.played) &&
    ids(value.handOrder) &&
    matches(value.handOrder, value.hand) &&
    wholeDeck([...value.deck, ...value.hand, ...value.played])
  );
}
export function isShitheadGame(value: unknown): value is ShitheadState {
  if (
    !record(value) ||
    !isRules(value.rules) ||
    !cards(value.stock) ||
    !cards(value.pile) ||
    !cards(value.burned) ||
    !Array.isArray(value.players) ||
    value.players.length !== 2 ||
    ![0, 1].includes(value.turn as number) ||
    !["setup", "playing", "finished"].includes(value.phase as string) ||
    typeof value.message !== "string" ||
    value.message.length > 4096
  )
    return false;
  const all = [...value.stock, ...value.pile, ...value.burned];
  for (const player of value.players) {
    if (
      !record(player) ||
      !cards(player.hand) ||
      !cards(player.faceUp) ||
      !cards(player.faceDown) ||
      player.faceUp.length > 3 ||
      player.faceDown.length > 3
    )
      return false;
    if (player.tableSlots !== undefined) {
      if (!Array.isArray(player.tableSlots) || player.tableSlots.length !== 3) return false;
      for (const zone of ["faceUp", "faceDown"] as const) {
        if (
          !player.tableSlots.every(
            (slot) => record(slot) && (slot[zone] === null || typeof slot[zone] === "string"),
          )
        )
          return false;
        const refs = player.tableSlots.flatMap((slot) => (slot[zone] === null ? [] : [slot[zone]]));
        const zoneCards = player[zone];
        if (!ids(refs) || !cards(zoneCards) || !matches(refs, zoneCards)) return false;
      }
    }
    all.push(...player.hand, ...player.faceUp, ...player.faceDown);
    if (
      value.phase === "setup" &&
      (player.hand.length !== 3 || player.faceUp.length !== 3 || player.faceDown.length !== 3)
    )
      return false;
  }
  if (!wholeDeck(all)) return false;
  if (
    value.phase === "setup" &&
    (value.stock.length !== 34 || value.pile.length || value.burned.length)
  )
    return false;
  if (value.phase === "finished") {
    if (value.winner !== 0 && value.winner !== 1) return false;
    const winner = value.players[value.winner];
    return (
      !value.stock.length && !winner.hand.length && !winner.faceUp.length && !winner.faceDown.length
    );
  }
  return (
    value.winner === null &&
    (value.stock.length > 0 ||
      value.players.every(
        (player) => player.hand.length + player.faceUp.length + player.faceDown.length > 0,
      ))
  );
}

const instanceKeys = new WeakMap<Element, string>();
const counts = new Map<string, number>();
export function gameStorageKey(element: Element, kind: string): string {
  let key = instanceKeys.get(element);
  if (!key) {
    const index = counts.get(kind) ?? 0;
    counts.set(kind, index + 1);
    key = `cardgame:v1:${location.pathname}:${kind}:${index}`;
    instanceKeys.set(element, key);
  }
  return key;
}
export function readSavedGame(key: string): RecordValue | undefined {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    return record(value) && value.version === 1 && record(value.data) ? value.data : undefined;
  } catch {
    return undefined;
  }
}
export function writeSavedGame(key: string, data: RecordValue): boolean {
  try {
    localStorage.setItem(key, JSON.stringify({ version: 1, data }));
    return true;
  } catch {
    return false;
  }
}

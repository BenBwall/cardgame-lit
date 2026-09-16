import type { Card } from "@cardgame/cards.js";
import type { ShitheadRules, ShitheadSource } from "@cardgame/shithead-state.js";

export type OnlineShitheadAction =
  | { kind: "ready" }
  | { kind: "swap"; hand: number; faceUp: number }
  | { kind: "play"; indices: number[] }
  | { kind: "pickup" };
export type OnlineTableSlot = { faceUp: string | null; covered: boolean };
export type OnlineShitheadPlayer = {
  hand: readonly Card[] | null;
  handCount: number;
  faceUp: readonly Card[];
  faceDownCount: number;
  slots: OnlineTableSlot[];
};
export type OnlineShitheadView = {
  phase: "setup" | "playing" | "finished";
  rules: ShitheadRules;
  actor: number;
  turn: number;
  winner: number | null;
  ready: boolean[];
  stockCount: number;
  pile: readonly Card[];
  burnedCount: number;
  players: OnlineShitheadPlayer[];
  source: ShitheadSource;
  canPickup: boolean;
};

import type { Card } from "../cards.js";
import type { ShitheadRules, ShitheadSource } from "../shithead-state.js";

export type OnlineShitheadAction =
  | { kind: "ready" }
  | { kind: "swap"; hand: number; faceUp: number }
  | { kind: "play"; indices: number[] }
  | { kind: "pickup" };
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
  players: {
    hand: readonly Card[] | null;
    handCount: number;
    faceUp: readonly Card[];
    faceDownCount: number;
    slots: { faceUp: string | null; covered: boolean }[];
  }[];
  source: ShitheadSource;
  canPickup: boolean;
};

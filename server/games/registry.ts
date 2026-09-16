import { defineGame, type RegisteredGame } from "../core/adapter.js";
import { shitheadAdapter } from "./shithead.js";

/** Stable protocol IDs; adding a game never changes the room service. */
export const games = { shithead: defineGame(shitheadAdapter) } as const satisfies Record<
  string,
  RegisteredGame
>;
export type GameId = keyof typeof games;

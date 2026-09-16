import { randomInt } from "node:crypto";
import { cardId } from "@cardgame/cards.js";
import { isRecord } from "@cardgame/multiplayer/protocol.js";
import type {
  OnlineShitheadAction,
  OnlineShitheadView,
} from "@cardgame/multiplayer/shithead-view.js";
import {
  DEFAULT_SHITHEAD_RULES,
  newShithead,
  playShithead,
  pickupShithead,
  swapShithead,
  startShithead,
  canPickupShithead,
  shitheadSlots,
  shitheadSource,
  type ShitheadRules,
  type ShitheadState,
} from "@cardgame/shithead-state.js";
import type { GameAdapter } from "@server/core/adapter.js";

type State = { game: ShitheadState; ready: readonly boolean[] };
const integer = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0;

function update(state: State, actor: number, action: OnlineShitheadAction): State {
  const { game } = state;
  if (actor !== 0 && actor !== 1) return state;
  if (action.kind === "ready") {
    if (game.phase !== "setup" || state.ready[actor]) return state;
    const ready = state.ready.map((value, i) => value || i === actor);
    return { ready, game: ready.every(Boolean) ? startShithead(game) : game };
  }
  if (action.kind === "swap") {
    if (game.phase !== "setup" || state.ready[actor]) return state;
    const player = game.players[actor];
    const hand = player.hand[action.hand],
      up = player.faceUp[action.faceUp];
    if (!hand || !up) return state;
    // The local swap helper addresses seat zero. Rotate only for this pure operation.
    const rotated =
      actor === 0 ? game : { ...game, players: [game.players[1], game.players[0]] as const };
    const next = swapShithead(rotated, cardId(hand), cardId(up));
    return {
      ...state,
      game: actor === 0 ? next : { ...next, players: [next.players[1], next.players[0]] },
    };
  }
  const next =
    action.kind === "pickup"
      ? pickupShithead(game, actor)
      : playShithead(game, actor, action.indices);
  return next === game ? state : { ...state, game: next };
}

export const shitheadAdapter: GameAdapter<
  ShitheadRules,
  State,
  OnlineShitheadAction,
  OnlineShitheadView
> = {
  title: "Shithead",
  minPlayers: 2,
  maxPlayers: 2,
  parseOptions(value) {
    if (
      !isRecord(value) ||
      Object.keys(value).some((k) => !Object.hasOwn(DEFAULT_SHITHEAD_RULES, k))
    )
      throw new Error("Invalid game options.");
    const options = { ...DEFAULT_SHITHEAD_RULES };
    for (const key of Object.keys(options) as (keyof ShitheadRules)[]) {
      if (value[key] !== undefined) {
        if (typeof value[key] !== "boolean") throw new Error("Rules must be true or false.");
        options[key] = value[key];
      }
    }
    return options;
  },
  create(options) {
    return {
      game: newShithead(() => randomInt(0x100000000) / 0x100000000, options, false),
      ready: [false, false],
    };
  },
  parseAction(value) {
    if (!isRecord(value)) return null;
    if (value.kind === "ready" || value.kind === "pickup") return { kind: value.kind };
    if (value.kind === "swap" && integer(value.hand) && integer(value.faceUp))
      return { kind: "swap", hand: value.hand, faceUp: value.faceUp };
    if (
      value.kind === "play" &&
      Array.isArray(value.indices) &&
      value.indices.length > 0 &&
      value.indices.length <= 4 &&
      value.indices.every(integer)
    )
      return { kind: "play", indices: value.indices };
    return null;
  },
  validate: (state, actor, action) => update(state, actor, action) !== state,
  update,
  complete: (state) => state.game.phase === "finished",
  project({ game, ready }, actor) {
    return {
      phase: game.phase,
      rules: game.rules,
      actor,
      turn: game.turn,
      winner: game.winner,
      ready: [...ready],
      stockCount: game.stock.length,
      pile: game.pile,
      burnedCount: game.burned.length,
      players: game.players.map((player, index) => ({
        hand: actor === index ? player.hand : null,
        handCount: player.hand.length,
        faceUp: player.faceUp,
        faceDownCount: player.faceDown.length,
        // Never serialize blind IDs, stock, or the local engine's computer-oriented message.
        slots: shitheadSlots(player).map((slot) => ({
          faceUp: slot.faceUp,
          covered: slot.faceDown !== null,
        })),
      })),
      source: shitheadSource(game.players[actor]),
      canPickup: canPickupShithead(game, actor),
    };
  },
};

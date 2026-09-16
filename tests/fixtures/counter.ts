import type { GameAdapter } from "../../server/core/adapter.js";
import { isRecord } from "../../src/multiplayer/protocol.js";

/** Test-only game: three-player support and entirely different options/actions/state. */
export const counterAdapter: GameAdapter<
  { target: number },
  { count: number; turn: number; players: number; target: number },
  { add: number },
  { count: number; turn: number; you: number }
> = {
  title: "Test counter",
  minPlayers: 2,
  maxPlayers: 3,
  parseOptions(value) {
    if (
      !isRecord(value) ||
      !Number.isInteger(value.target) ||
      Number(value.target) < 1 ||
      Number(value.target) > 10
    )
      throw new Error("Invalid target");
    return { target: Number(value.target) };
  },
  create: (options, players) => ({ count: 0, turn: 0, players, target: options.target }),
  parseAction: (value) => (isRecord(value) && value.add === 1 ? { add: 1 } : null),
  validate: (state, actor) => state.turn === actor && state.count < state.target,
  update: (state) => ({ ...state, count: state.count + 1, turn: (state.turn + 1) % state.players }),
  complete: (state) => state.count >= state.target,
  project: (state, actor) => ({ count: state.count, turn: state.turn, you: actor }),
};

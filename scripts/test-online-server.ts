import { startServer } from "@server/http.js";
import { RoomService } from "@server/core/rooms.js";
import { defineGame } from "@server/core/adapter.js";
import { games } from "@server/games/registry.js";
import { counterAdapter } from "../tests/fixtures/counter.js";
import { shitheadAdapter } from "@server/games/shithead.js";
import { newShithead } from "@cardgame/shithead-state.js";

// Reproducible browser deal; production still uses cryptographic randomness.
const browserShithead = defineGame({
  ...shitheadAdapter,
  create(options) {
    let seed = 731;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    return { game: newShithead(random, options, false), ready: [false, false] };
  },
});

startServer({
  port: 8787,
  origins: ["http://127.0.0.1:4175"],
  service: new RoomService({
    ...games,
    shithead: browserShithead,
    "test-counter": defineGame(counterAdapter),
  }),
});

# Multiplayer validation — 2026-09-16

Implementation was developed in the sibling `cardgame-lit` checkout and copied into `arcada-home/vendor/cardgame`. Both started at `2f5098c4be9183aba2b8f4c9beb0e8eb7aeab158`, with clean working trees. Changes are uncommitted. Nothing was pushed or deployed.

## Passing checks

| Check                              | Result                                                                                                                             |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Cardgame `bun run check`           | Browser, server, scripts and multiplayer test TypeScript passed                                                                    |
| Cardgame `bun test tests`          | 55 passed, including actual HTTP/WebSocket and HTTPS/WSS integration                                                               |
| Cardgame multiplayer browser suite | 6 passed: Chrome and Firefox, two isolated player contexts each                                                                    |
| Homepage `bun run check`           | JavaScript lint, TypeScript, script types and W3C validation passed                                                                |
| W3C HTML/CSS                       | 10 files, zero errors, zero failed requests; existing informational messages/warnings                                              |
| Homepage unit suites               | 8 theme tests and 4 validator tests passed                                                                                         |
| Homepage `bun run test`            | All 12 browser tests passed in Edge                                                                                                |
| Configured frontend URL            | Additional homepage browser check passed against a build with an explicit HTTPS URL; default unconfigured build restored afterward |
| Formatting                         | All changed files passed explicit formatting checks                                                                                |
| Source synchronization             | Modified/new files compared byte-for-byte between sibling and vendored checkout                                                    |

The online browser suite exercises room creation/joining with duplicate names, lowercase codes, room-code copying, both players' setup, matching sets, complete Shithead play including blind endgame, wire-level hidden-hand checks, reconnection with the same seat/state, no credentials in browser storage, responsive layouts, leave/closed-room behavior, accessible failures, the generic second game's completion/rematch flow, and an unsupported frontend game. Browser deals are seeded only in the test server for reproducibility; production uses cryptographic randomness.

Unit/integration coverage includes cross-player and cross-room credential rejection, origin checks and preflights, ticket rotation/expiry/replay, concurrent last-seat joins, unauthorized start, malformed/oversized messages, rate limits including malformed frames and spoofed forwarding headers, revision conflicts, sequence gaps/replay, lost acknowledgements across reconnect, replacement-socket isolation, unanimous rematches, heartbeat and room expiry, and per-seat privacy through all eight Shithead rule combinations. The TLS smoke test ran successfully with an ephemeral self-signed certificate generated using local OpenSSL.

The homepage theme test's unscoped file-input locator matched both theme and card-art upload fields. Its two import locators were scoped to `appearance-panel`; the full homepage suite then passed. No theme/product behavior changed.

## Existing broader-check failures

The full cardgame browser suite initially produced **130 passed, 4 failed, 2 skipped**. These failures were outside multiplayer:

- `hand-layout.pw.ts`: “tilted cards can be dragged to reorder, undone, and returned after an invalid drop” failed in Chrome and Firefox because no drag preview appeared. Both failures also reproduced using an archived, unchanged `HEAD` source bundle.
- `card-motion.pw.ts`: “playing, undo, reordering, sorting, and resetting animate their card movements” failed in Firefox while asserting transient return-deck flights. The same failure reproduced against unchanged `HEAD`; that baseline run also showed a Chrome transient-flight failure.
- `hand-reorder.pw.ts`: “grab position controls rotation for horizontal, vertical, and diagonal pulls” missed its rotation threshold in Chrome under the full-suite load. It passed when rerun alone, and passed in the baseline comparison.

These local animation tests and implementation were left unchanged. The final multiplayer suite passed separately after all multiplayer fixes.

The repository-wide homepage `bun run format:check` also reports the pre-existing generated `vendor/cardgame/src/card-art-assets.ts`. Its Git blob hash is unchanged from `HEAD`: `b0e9f143e65c54ad73cc45e1b5460e92aa0eb0a4`. It was not reformatted as part of this feature.

## Operational limits

The backend still needs a separately provisioned host, a valid TLS certificate, and a configured frontend `MULTIPLAYER_URL`. Domus remains static. Rooms use one process's in-memory store and are lost on restart. Browser credentials are memory-only: transient disconnects reconnect, while a tab reload/close loses the anonymous session. See [server setup and protocol](README.md) for deployment, expiry, limits and adapter extension details.

## Game tabs follow-up

The game dropdown was replaced with Free play/Shithead tabs and Single player/Multiplayer Shithead subtabs. Keyboard navigation, selected-tab persistence, local state restoration and an uninterrupted online room across tab changes were checked in Chrome and Firefox. Of 68 relevant cardgame browser cases, 66 passed in the grouped runs; two transient-animation checks passed on isolated retries. Both affected homepage integration checks passed in Edge. TypeScript, homepage lint, builds, changed-file formatting and source synchronization passed. A rendered Shithead screenshot was also inspected. No push or deployment was performed.

## Card appearance popout follow-up

Card appearance now opens from a vertical tab fixed to the left edge, following the original cardgame's Options placement. The settings component sits outside the main table and uses a native nonmodal popover with outside-click/Escape dismissal, an explicit close button, and focus restoration across its shadow boundary. It scrolls independently and fits 320px screens without shifting the table.

Chrome/Firefox checks covered keyboard focus, all four dismissal paths, unchanged table geometry, narrow-screen bounds, reachable settings, artwork uploads/persistence/errors, random card backs, and game tabs. The grouped run passed 23 of 24 cases; the Firefox computer-draw transient-animation check passed on its isolated rerun. Both homepage integration checks passed in Edge. Primary and homepage TypeScript/build checks, homepage lint, changed-file formatting, and source synchronization passed. Light and dark desktop/mobile screenshots were inspected. No push or deployment was performed.

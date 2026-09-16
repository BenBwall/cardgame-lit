# Anonymous multiplayer server

This Bun/TypeScript service runs separately from the static frontend. Production has no dependency on the test game or browser UI. Bun's native, uWebSockets-backed server handles WebSocket upgrades, TLS, frame limits and backpressure: [Bun WebSocket documentation](https://bun.com/docs/runtime/http/websockets).

## Run locally

From the cardgame checkout, with Bun 1.4.2 or newer:

```powershell
bun install --frozen-lockfile
bun run dev
```

This builds and serves the demo at `http://127.0.0.1:4175` and starts the game server at `http://127.0.0.1:8787`. Source saves rebuild the demo; refresh the browser to load them. The Arcada homepage's `bun run dev` also starts the backend automatically and connects its preview to it. A compatible server already running at the configured URL is reused. Stopping a preview stops only the backend it started. Restart development after changing environment variables or server code.

Open the preview in two separate browser contexts. Select Shithead, then the Multiplayer subtab. Both users may use the same display name. The creator chooses the rules, shares the six-character code, and starts once both players connect. Each player may swap their own setup cards, then both mark themselves ready. To run only the backend, use `bun run server:dev`.

### Environment variables

Bun reads `.env` in the checkout where you run the command. Copy `.env.example` to `.env` and uncomment the settings you need, or set them in your shell.

| Variable               | Purpose and default                                                                                                                                                                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MULTIPLAYER_DEV_URL`  | Browser server origin in development; defaults to `http://127.0.0.1:8787`. A loopback HTTP URL starts a local backend; an HTTPS URL uses an externally managed backend.                                                                         |
| `MULTIPLAYER_PROD_URL` | Browser server origin for production builds; unset by default. Use your public HTTPS origin.                                                                                                                                                    |
| `MULTIPLAYER_URL`      | Overrides either mode-specific URL. An explicitly empty value disables online play and automatic backend startup.                                                                                                                               |
| `MULTIPLAYER_PORT`     | Local game server port and the port in the default development URL; 8787 in development or proxy mode, 8443 for direct production TLS. An explicit development URL determines the auto-started server's port.                                   |
| `MULTIPLAYER_HOST`     | Bind address for a manually started server; `127.0.0.1` in development, `0.0.0.0` in production. Development is restricted to loopback. Automatic startup uses the configured URL's host.                                                       |
| `MULTIPLAYER_ORIGINS`  | Comma-separated exact browser origins, without paths, trailing slashes or wildcards. Defaults to localhost/127.0.0.1 on ports 4173–4175 in development, plus the launching preview's origin; production defaults to `https://people.arcada.fi`. |
| `MULTIPLAYER_TLS_MODE` | `direct` (default) requires production certificates; `proxy` serves internal HTTP behind an HTTPS proxy.                                                                                                                                        |
| `TLS_CERT`, `TLS_KEY`  | Certificate and key paths, both required for direct production TLS. Leave both unset in proxy mode. Automatic HTTP development ignores these.                                                                                                   |
| `PORT`                 | Frontend preview port (4175 standalone, 4173 homepage). A manually started backend also accepts this as a fallback when `MULTIPLAYER_PORT` is absent.                                                                                           |

`bun run dev` selects development automatically; standalone builds also recognize `NODE_ENV=development` or `MULTIPLAYER_DEV=1`. Production builds have no localhost fallback. The resolved URL is emitted into static HTML, so rebuild to change it. Without a URL, the online lobby explains that online play is unavailable; local modes continue working. Embedders can set `<card-game multiplayer-url="https://cards.example.org">` or its `multiplayerUrl` property. Only HTTPS is accepted, except HTTP on loopback for development. Do not put credentials or paths in this URL. When reusing a manually started server, ensure its allowed origins include your preview's origin.

## Production

Copy this checkout to a host that supports Bun and persistent WebSocket connections. Set `TLS_CERT` and `TLS_KEY` to readable certificate and private-key paths, and `MULTIPLAYER_PORT` if needed (default 8443). Run `bun run server`. Direct TLS is the default: production refuses to start without certificates and binds to `0.0.0.0`; development HTTP binds only to loopback. Use a valid certificate for your public server hostname, arrange certificate renewal and process restarts with your hosting provider, and expose HTTPS/WSS through its firewall. Keep private keys outside the checkout. The supplied `Dockerfile` also runs the service with the same environment variables and mounted certificates.

### Behind an HTTPS proxy

For a hosting platform such as Railway that terminates public HTTPS/WSS and forwards HTTP/WebSocket traffic to the container, set:

```dotenv
NODE_ENV=production
MULTIPLAYER_TLS_MODE=proxy
MULTIPLAYER_ORIGINS=https://people.arcada.fi
```

`MULTIPLAYER_TLS_MODE` accepts `direct` (the default) or `proxy`. Leave `TLS_CERT` and `TLS_KEY` unset in proxy mode. Unknown modes and proxy mode combined with certificate paths are rejected. The server binds to `0.0.0.0` in production and reads `PORT` supplied by the platform, unless `MULTIPLAYER_PORT` explicitly overrides it. Without either port variable, proxy mode uses 8787. Start it with `bun run server`; no development flag is needed. Proxy mode is an explicit deployment choice, never inferred from request headers or the hosting provider's environment variables. It keeps production origin restrictions, player authentication and the browser's HTTPS URL requirement.

Only the proxy should be publicly reachable; keep the plain HTTP listener on the hosting platform's internal network. The proxy must support WebSocket upgrades and preserve Origin, Authorization and WebSocket subprotocol headers. This option does not enable trust in forwarded client-IP headers: rate limits still use the direct peer address (see Resource limits).

For Railway, use the repository root as the build context and `RAILWAY_DOCKERFILE_PATH=server/Dockerfile`; the Dockerfile already starts the backend. Generate a public domain, configure `/health` as the health check, use one replica, and leave Serverless sleeping disabled. Set the homepage build's `MULTIPLAYER_PROD_URL` to the generated HTTPS origin and rebuild the frontend. Rooms still disappear when the server restarts or redeploys. [Railway Dockerfiles](https://docs.railway.com/builds/dockerfiles) and [public networking](https://docs.railway.com/networking/public-networking).

The default production browser origin is `https://people.arcada.fi`; override it with `MULTIPLAYER_ORIGINS`. Preflights allow POST with Content-Type and Authorization. There are no cookies, credentialed CORS, wildcard origins, or redirects. WebSocket upgrade origins must match too. All `people.arcada.fi/~user/` pages share this origin: **CORS is not authentication**. A permitted origin still needs a valid room-scoped credential. A room code is an invitation to take an available seat, not authority to control an existing seat. There is no private-room password or room directory.

`GET /health` returns `{ "status": "ok", "protocol": 1 }` without room/player data. Termination signals close sessions gracefully. All rooms are in memory and disappear on restart. Run one process/replica; sticky routing alone does not make this store distributed. For multiple replicas, implement atomic room transactions and cross-process socket delivery before scaling.

### Railway infrastructure as code

[`railway-backend.ts`](../railway-backend.ts) declares a `cardgame-backend` service sourced from `BenBwall/cardgame-lit` on `main`. It builds `server/Dockerfile` from the repository root, starts the production backend in proxy TLS mode on port 8787, checks `/health`, and keeps one replica running with sleeping disabled. Railway manages public HTTPS/WSS; certificate files are not needed. Restarting or deploying still ends active games.

Install Railway CLI 5.42.1 or newer. The pinned `railway` development dependency provides the TypeScript IaC SDK and is installed by `bun install`. The IaC file is included in `bun run check`.

Create a dedicated Railway project/environment for this backend, authorize Railway's GitHub integration to read the repository, and run these commands from the cardgame checkout:

```sh
bun install --frozen-lockfile
railway login
railway link
bun run railway:plan
bun run railway:apply
railway domain --service cardgame-backend --port 8787
```

The scripts run `railway config plan --file railway-backend.ts` and `railway config apply --file railway-backend.ts` through a launcher that passes the resolved Railway executable to the SDK's version check. This avoids a misleading "requires Railway CLI 5.42.1 or newer" error in Git Bash on Windows, even when the CLI is already current. Use the package scripts for both commands; extra flags are forwarded, for example `bun run railway:plan --json`.

Planning reads the linked environment; applying changes it after showing the plan. This file describes the whole target environment, so omitted services or variables can be removed. Use a dedicated environment and check the plan before applying to existing resources. Do not run it directly with `bun railway-backend.ts`; it exports configuration for the Railway CLI.

Generated Railway domains are managed separately from the IaC file. After creating the domain, check `https://<generated-domain>/health` and set `MULTIPLAYER_PROD_URL=https://<generated-domain>` in the homepage's build environment, then rebuild and publish the homepage. Set additional allowed browser origins by editing `MULTIPLAYER_ORIGINS` in the IaC file and applying again. Source pushes to `main` deploy application changes; changes to the IaC file itself need another plan/apply.

See Railway's [IaC guide](https://docs.railway.com/infrastructure-as-code), [TypeScript reference](https://docs.railway.com/infrastructure-as-code/reference), and [CLI commands](https://docs.railway.com/cli/config).

## Protocol and security boundaries

- `POST /rooms`: `{ gameId, options, username }` creates a room. `POST /rooms/:code/join`: `{ username }` takes a seat. Codes normalize to uppercase. Names are trimmed display strings (1–32 characters, no control/format characters); duplicates are explicitly allowed.
- Admission returns `{ code, playerId, credential, expiresAt }`. Player IDs and credentials come from cryptographic randomness; 256-bit credentials are stored as SHA-256 hashes server-side. Identity is never derived from a display name, seat label, socket payload, or room code.
- `POST /rooms/:code/ticket`: `{ playerId }` with `Authorization: Bearer <credential>` issues a 20-second ticket. One outstanding ticket per player; a new ticket replaces the previous one. Tickets are room/player/origin-bound, single-use, and consumed atomically on upgrade.
- Connect to `wss://<server>/rooms/:code/socket`, offering subprotocols `cardgame.v1` and `ticket.<ticket>`. Only `cardgame.v1` is selected. Tickets never appear in URLs; configure your proxy to redact Authorization and WebSocket protocol headers and never log request bodies. Credentials never appear in snapshots.
- The server sends individualized `snapshot` messages. The adapter projects the authoritative state for the authenticated seat. There are no public room snapshots, spectators, client-authored state, or broadcasts of raw game state.
- Commands are `{ type: "start" | "action" | "rematch", revision, sequence, action? }`. Revisions increase through presence changes, actions and rematches. A stale revision is rejected with a fresh snapshot. Per-player sequences begin at 1, increase exactly once per processed command (including rule/revision rejections), and never reset during rematches. Old sequences cannot mutate state; the latest acknowledgement is cached. The client allows one pending command and resends its identical envelope after a connection loss, never silently rebasing an uncertain move.
- Only the creator starts a game, with the adapter's player limits satisfied and all seats connected. Options are validated at room creation and immutable for the room. Completion blocks further game actions. Rematches require all players' consent and connected seats; the server creates fresh game state with the same options and persistent seat identities.
- `POST /rooms/:code/leave` uses the same credential and player ID. Explicitly leaving closes the whole room, revoking every seat and ticket. Disconnecting reserves the existing seat for two minutes; another username cannot reclaim it. Reconnecting with the credential replaces any older socket, whose messages/close callback can no longer affect that seat.

The browser keeps credentials, tickets and pending commands in page memory only: no localStorage, sessionStorage, cookies or URLs. Transient connection loss reconnects automatically. **Reloading or closing the tab loses the credential**; use a new room afterward. A tab whose credential is lost cannot reclaim a seat using the username/code. The abandoned room expires after the two-minute grace period. Switching local/online modes keeps the existing online component alive until the page is closed or the player leaves.

This protects against guessing identities and unsolicited requests from other pages. It does not protect against compromised code in the playing page or another same-origin document that already has script access to that page. Deploy the frontend on a dedicated origin if stronger browser isolation is required. Never treat the shared Arcada origin as a user identity.

## Resource limits

Defaults: 500 rooms; six random code characters; 30 minutes without an accepted game command/admission; two-hour absolute room lifetime; two-minute disconnected-seat grace; 20-second tickets; 15-second heartbeat/cleanup sweep; 45-second missing-pong timeout. Heartbeats, rejected actions and ticket requests do not keep an idle room alive. Expiry is checked on admission/authentication/actions as well as during cleanup.

HTTP: 4 KiB request bodies, 240 requests/minute per direct peer IP, 12 creates/minute per peer IP, and at most 10,000 IP buckets. Forwarded headers are deliberately ignored. If a proxy is added, all clients share its limit until a trusted proxy/IP policy is implemented. WebSockets: 4 KiB frames, 64 KiB backpressure limit, no compression, 60-second transport idle timeout; 100 frames/10 seconds per connection including malformed frames, plus 80 validly parsed messages/ticket requests per player/10 seconds. Closed/replaced sockets are unable to issue actions. These are application-level controls, not a substitute for infrastructure-level denial-of-service protection.

## Add a game

1. Implement `GameAdapter<Options, State, Action, View>` from `core/adapter.ts`: player limits, runtime options/action parsing, state creation, action validation, immutable authoritative update, completion and per-seat projection. State updates/validation must be pure and synchronous. Projections must be JSON-safe and reveal only allowed information. Never use display names for rules or authority.
2. Register `defineGame(adapter)` under a new stable literal ID in `games/registry.ts`. `GameId` is the compile-time union of registry keys. The closure preserves each adapter's type relationships while giving core a game-independent interface.
3. Add a `LobbyGame` entry with options and board renderers on the frontend. The reusable lobby owns create/join, presence, errors, copying, leaving and rematch. Its client owns transport/reconnect/revision handling. Game renderers emit actions; server validation remains authoritative.
4. Test malformed actions, projection privacy, completion and rematches. `tests/fixtures/counter.ts` demonstrates a different state/action/options model with 2–3 players. Only `scripts/test-online-server.ts` loads it; it is absent from the production registry and Docker image.

Shithead's adapter lives in `games/shithead.ts`. It reuses pure local rules, disables automatic computer setup, permits both humans to swap/ready, and projects own hand, public upcards/pile and counts. It never serializes opponents' hands, stock contents, blind-card IDs/values, or the local computer-oriented status message. `revealUncovered` intentionally moves exposed cards into public upcards according to the chosen rule.

## Checks

```powershell
bun run check
bun test tests
bun run test:browser
```

Browser tests start an isolated test server on 8787 and static preview on 4175; leave these ports free. Chrome and Firefox each run two independent browser contexts for multiplayer. Coverage includes duplicate names, lowercase codes, setup/play synchronization, hidden data in actual frames, reconnect identity/state, memory-only credentials, responsive layout, leave revocation, accessible errors, the second game, and unanimous rematches. Unit/integration tests additionally cover all Shithead rule combinations through completion, malformed/oversized transport, CORS, ticket replay, cross-room/player credentials, revisions/deduplication, rate limits, expiry and heartbeat handling.

The two-player browser test also plays Shithead through its blind endgame to completion, using a reproducible deal supplied only by the test server and exercising the real adapter's actions/projections. Production shuffling remains cryptographic. The TLS test generates a one-day self-signed certificate in a temporary directory and checks HTTPS plus WSS; it needs OpenSSL on PATH and is explicitly skipped when OpenSSL is unavailable. Certificate verification is bypassed only in that test, never in the production browser client.

# Card game · Lit

A browser-only, single-player port of [BenBwall/cardgame](https://github.com/BenBwall/cardgame), based on commit `adceeca406f95b9044913ff2300e4484364e14a5`.

The original is a free-play card table, not an implemented solitaire variant. This port preserves its shuffled 52-card deck, drawing, playing cards from your hand, suit symbols, and ace-low sorting model. It adds a visible played pile, sort controls, undo, and a new-deck control. There are no opponents, rooms, scores, accounts, network requests, or game servers. All state belongs to the component instance in the current tab and resets on reload.

SolidStart, Solid stores, SSR entry points, routing, Tailwind, global theme scripts, DOM measurement animations, and the empty opponent UI have been removed. Lit handles reactive state and scoped styles. Cards use native buttons, support keyboard play, respect reduced motion, and wrap on small screens.

## Develop and build

```sh
bun install --frozen-lockfile
bun run check
bun test
bun run build
bun run test:browser
```

The build emits reusable ES modules and declarations in `dist/`, and a self-contained static demo in `demo/`. Serve `demo/` with any static file host. No runtime server is required.

Browser tests use Microsoft Edge and a local test server, and cover mouse and touch drags, directional tilt and settling, reduced motion, wrapped rows, keyboard reordering, undo, cancellation, and click/tap-to-play.

Cards animate between their actual positions: draws start face down and flip around their vertical axis as they fly from the deck into the hand, arriving face up without spinning clockwise. Played cards fly to the played pile, and sorting or reordering slides cards into their new slots. Invalid drops and canceled drags fly back from their current position and angle. Undo reverses card movements; cards returning to the deck flip face down. A new deck gathers the visible cards and shuffles. Rapid actions continue from any flight already in progress. Reduced motion skips these flights, and scrolling, resizing, or removing the component clears them safely.

## Arrange your hand

Drag a card to the marked insertion point to reorder your hand with a mouse, touch, or pen. The hand switches to **Manual order**; drawing adds cards at the end of your arrangement. Selecting **Draw order** restores the original draw sequence, and you can switch back to your manual arrangement. **Undo** restores the previous arrangement and sort selection. Drop outside the hand or press Escape to cancel.

While dragging, the card follows with a little inertia and swings around your grab point. The free side hangs lower when you grab a side or corner, so left and right grips look different even during slow horizontal drags. Movement adds a stronger swing; when you pause, it settles into that hanging angle. A centered grip stays level. With reduced motion enabled, it stays upright and follows the pointer directly.

Click or tap a card to play it. For keyboard reordering, focus a card and use **Alt + Left/Right**, or **Alt + Home/End** to move it to the first/last position. Enter and Space still play the focused card.

## Embed

Import the exported root component once to register the custom element:

```ts
import { CardGame } from "@benbwall/cardgame-lit";
// The import registers <card-game>; the class is also available for programmatic use.
```

```html
<card-game></card-game> <noscript>Enable JavaScript to play this local card game.</noscript>
```

Consumers bundle `dist/index.js` with its `lit` peer dependency, or provide an import map for `lit`. A TypeScript host can import `src/index.ts` directly and compile the source. No CDN is needed. Each component has independent state. Create the element in the browser; no SSR or hydration is required for the game.

The component inherits font and the optional host CSS variables `--color-text`, `--color-muted`, `--color-surface`, `--color-background`, `--color-hover`, `--color-border`, `--color-border-strong`, and `--color-primary`. Standalone fallbacks are supplied.

## Provenance

Ported from Ben Bergenwall's original repository linked above. The original repository contains no license file; this port does not add a new license grant.

## Deploy to the Arcada homepage

On Ben's configured Windows computer, pushing `main` also updates the card game embedded at [people.arcada.fi/~bergenwb](https://people.arcada.fi/~bergenwb/):

```sh
git push origin main
```

The local `origin` has two push destinations, in order: this GitHub repository, then `H:/.cardgame-lit-deploy.git`. Only a main update triggers the receiver. It creates an isolated checkout of `BenBwall/arcada-home`, commits the new `vendor/cardgame` gitlink, pushes that parent commit to GitHub, and deploys through the homepage's existing build and validation hooks. The live site is updated only after a successful static build.

This requires access to H: and GitHub from the configured computer. Other branches and tags do not deploy, and this local setup is not installed by cloning the repository on another machine. Check the push output for deployment errors even if Git accepted the commit.

Setup and recovery commands live in the sibling `arcada-home` project:

```sh
bun run deploy:cardgame:setup
bun run deploy:cardgame
```

The first command configures the standalone game checkout and the homepage submodule. The second retries deployment from the current GitHub game main, including failed publication after an accepted push. The hooks leave both developer checkouts untouched. Before later homepage changes, pull `arcada-home/main` and update its submodules to pick up the automatically committed game pin.

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
```

The build emits reusable ES modules and declarations in `dist/`, and a self-contained static demo in `demo/`. Serve `demo/` with any static file host. No runtime server is required.

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

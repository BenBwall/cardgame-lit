# Card game · Lit

A browser-only, single-player port of [BenBwall/cardgame](https://github.com/BenBwall/cardgame), based on commit `adceeca406f95b9044913ff2300e4484364e14a5`.

Choose **Free play** or **Shithead · vs computer** in the Game selector. Free play preserves the original shuffled 52-card deck, drawing, playing, ace-low sorting, undo, and hand arrangement. Shithead adds a local computer opponent. There are no rooms, accounts, network requests, or game servers. Both games and their settings are saved automatically in browser storage and restored after a refresh or return visit.

## Shithead

Open **Card appearance** above either game to choose faces and backs independently. Alongside the original style, two complete CC0 decks (Kenney Pixel and GreyWyvern Wildlife) and 14 alternative backs are built in. Choose **GreyWyvern · Random per card** to assign a random back to each card once per game. The assignments survive moves, undo, mode changes, and reloads; a new deal assigns new backs. Individual fixed GreyWyvern backs remain available. Kenney sprites display without their transparent outer padding, keeping the visible card at the normal proportions. Source links and original license notices are in [CARD-ART-LICENSES.md](CARD-ART-LICENSES.md).

Upload a PNG, JPEG, or WebP for a back or a chosen card, or import several faces named like `A-Spades.png`, `10-Hearts.jpg`, and `K-Clubs.webp`. A partial custom deck uses original faces for missing cards. Files stay in the browser, are fitted without cropping to 240 × 348 pixels, and are saved separately from game state. Individual uploads are limited to 5 MB / 16 megapixels, with a 2 MB total encoded artwork limit. Invalid batches leave the previous artwork intact. If storage is full or unavailable, a notice appears and the previous saved artwork stays selected. Clear controls remove custom images. Artwork follows cards through drag/flip animations and pile previews, and applies to both modes without restarting either game.

The two-player game follows the [base rules on Wikipedia](<https://en.wikipedia.org/wiki/Shithead_(card_game)>): three hand cards, three face-up cards, and three face-down cards per player; optional hand/upcard swaps before starting; equal-or-higher matching sets with aces high; wild 2s; 10 and consecutive four-of-a-kind burns with another turn; automatic refills; voluntary pile pickup; and blind endgame reveals. An illegal blind card joins the picked-up pile. The first player out wins and the remaining player is the Shithead. The starter is determined from the original deal, preferring the first face-up 3, then a hand 3, then successive ranks. Jokers and optional special-rank variants are not included.

Click or drag a card to the play pile to play it. When matching ranks are available, clicking one starts selection: choose the cards you want and press **Play selected**, or **Cancel** to clear the selection without playing. **Select all** selects an entire matching set but still waits for **Play selected**. **Select matching cards** and Shift-click also start selection. This works for hand, face-up, and blind face-down play. Hover or focus the play pile or Out pile to see every card, top card first. Previews scroll for large piles and close with Escape. Click the central pile to pick it up. During setup, drag between a hand card and a face-up table card to swap them, or choose both cards. The hand uses the same fan/grid layouts, suit/rank/draw/manual sorting, mouse/touch/pen dragging, Alt + arrow/Home/End reordering, and draw-flip controls as free play. Hand arrangement never consumes a turn. Face-down cards stay beneath their covers in three fixed table positions; the computer's hand is shown as backs.

Card flights show plays, automatic draws, setup swaps, pile pickups, uncovered-card flips, and burns into the Out pile. A failed blind card flips at the pile before the cards travel back into the player's hand. Computer turns wait for these animations to finish. Turn markers show who plays next; detailed move announcements are available to screen readers rather than displayed as status paragraphs. Reduced motion skips flights. Scrolling, resizing, opening Options, and removing the component cancel flights and restore every card's visibility. Hidden cards use opaque animation keys without rank or suit attributes.

The computer saves strong cards during setup, plays its lowest legal matching set, and chooses blind cards by position without inspecting them. Switching modes preserves both tables. Reloading restores the committed move without replaying animations, and a pending computer turn resumes when the Table tab is visible.

The **Options** tab lets you allow or forbid voluntary pile pickup (on by default), grant another turn after a 2 (off by default), and reveal the lower card when its cover is played (off by default). Revealed cards become playable face-up cards in their original table positions. With voluntary pickup off, a player must make a legal play if possible or attempt a blind card; failed blind plays still collect the pile. Both players follow the same rules.

During setup, options apply immediately. Once play starts, changes are saved for the next deal; **Apply options and deal new game** starts over with those rules. Options pause computer turns while open, and returning to Table resumes play. Choices persist across new deals, mode changes, and reloads. The how-to text describes the current deal's rules.

Saved data includes the selected mode, both games, active and pending rules, hand layout and order, sorting, flip direction, matching-card selection, and the most recent 200 free-play undo steps. Saves are versioned and validated before loading; invalid data starts a fresh table, and unavailable browser storage leaves the game playable with a visible notice. Each component uses a separate key based on page path and instance order; set `storage-key` explicitly for embeds whose instance order changes. Separate tabs load the latest save when opened but do not synchronize live.

The pure rules engine and `ShitheadRules` are exported from `src/shithead-state.ts`. Pass custom rules as the second argument to `newShithead(random, rules)`. Tests cover all eight rule combinations, card conservation, stable table positions, setup, keyboard tabs, computer turns, hidden cards, reset, and responsive themes.

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

Browser tests use installed Google Chrome and Playwright Firefox (`bun --bun playwright install firefox`) with a local test server. They cover card identity and landing pixels at 100%, 150%, and 200% display scaling, mouse drags, directional tilt and settling, reduced motion, wrapped rows, keyboard reordering, undo, cancellation, and click-to-play. Native touch injection runs in Chrome only because it uses CDP.

Cards animate between their actual positions: draws start face down and flip around their vertical axis as they fly from the deck into the hand, arriving face up without spinning clockwise. Played cards fly to the played pile, and sorting or reordering slides cards into their new slots. Invalid drops and canceled drags fly back from their current position and angle. Undo reverses card movements; cards returning to the deck flip face down. A new deck gathers the visible cards and shuffles. Rapid actions continue from any flight already in progress. Reduced motion skips these flights, and scrolling, resizing, or removing the component clears them safely.

## Arrange your hand

Hands start in **Fan layout**, with overlapping cards arranged along an arc. The two icon buttons switch between **Fan layout** and **Grid layout**; hovering or focusing an icon shows its label. Larger hands form multiple fans so exposed card edges remain selectable on narrow screens. Switching layouts preserves the cards, their order, and undo history. Expanding or rearranging a fan adjusts moving cards' destinations without restarting their animation clocks or flips.

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

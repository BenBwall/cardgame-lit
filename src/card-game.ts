import { LitElement, css, html, nothing } from "lit";
import { FoldHorizontal, FoldVertical, Grid3x3, PlayingCards } from "@lucide/icons";
import { buildLucideSvg } from "@lucide/icons/build";
import { repeat } from "lit/directives/repeat.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { type Card, type SortOrder, SUIT_SYMBOLS, cardId, cardName } from "./cards.js";
import {
  type GameState,
  drawCard,
  handCards,
  newGame,
  playCard,
  reorderHand,
} from "./game-state.js";
import { HandDrag } from "./hand-drag.js";
import { CardMotion } from "./card-motion.js";
import { fanLayout } from "./hand-layout.js";

/** Import this module once, then use <card-game> anywhere on a static page. */
export class CardGame extends LitElement {
  static properties = {
    game: { state: true },
    history: { state: true },
    sortOrder: { state: true },
    message: { state: true },
    confirmingReset: { state: true },
    handLayout: { state: true },
    flipAxis: { state: true },
    handWidth: { state: true },
  };

  private game: GameState | undefined;
  private history: { game: GameState; sortOrder: SortOrder }[] = [];
  private sortOrder: SortOrder = "draw-order";
  private message = "Draw a card to begin.";
  private confirmingReset = false;
  private handLayout: "fan" | "grid" = "fan";
  private flipAxis: "X" | "Y" = "X";
  private handWidth = 600;
  private resizeObserver?: ResizeObserver;
  private cardMotion = new CardMotion(
    () => this.renderRoot,
    () => this.flipAxis,
  );
  private handDrag = new HandDrag((id, destination, preview) => {
    void this.reorder(id, destination, preview);
  });

  // Randomness belongs to a browser instance, never the static build or shared state.
  connectedCallback(): void {
    super.connectedCallback();
    this.game ??= newGame();
    this.cardMotion.connect();
    void this.updateComplete.then(() => {
      if (!this.isConnected) return;
      this.resizeObserver ??= new ResizeObserver(([entry]) => {
        if (Math.abs(this.handWidth - entry.contentRect.width) < 0.5) return;
        this.cardMotion.finish();
        this.handWidth = entry.contentRect.width;
      });
      this.resizeObserver.observe(this.renderRoot.querySelector(".game")!);
    });
  }

  disconnectedCallback(): void {
    this.handDrag.dispose();
    this.cardMotion.disconnect();
    this.resizeObserver?.disconnect();
    super.disconnectedCallback();
  }

  private animateChange(change: () => void, preview?: HTMLElement, shuffle = false): void {
    if (!this.game) return;
    const before = this.cardMotion.capture(this.game, preview);
    this.handDrag.dispose();
    change();
    void this.updateComplete.then(() => {
      if (this.game) this.cardMotion.animate(before, this.game, shuffle);
    });
  }

  private move(
    next: GameState,
    message: string,
    preview?: HTMLElement,
    sortOrder = this.sortOrder,
  ): void {
    if (!this.game || next === this.game) return;
    this.animateChange(() => {
      if (!this.game) return;
      this.history = [...this.history, { game: this.game, sortOrder: this.sortOrder }];
      this.game = next;
      this.sortOrder = sortOrder;
      this.confirmingReset = false;
      this.message =
        next.deck.length === 0 && next.hand.length === 0
          ? "All 52 cards played. Start a new deck to play again."
          : message;
    }, preview);
  }

  private draw(): void {
    if (!this.game) return;
    const next = drawCard(this.game);
    const card = next.hand.at(-1);
    if (card) this.move(next, `Drew ${cardName(card)}.`);
  }

  private async play(card: Card): Promise<void> {
    if (!this.game) return;
    const hand = handCards(this.game, this.sortOrder);
    const index = hand.findIndex((value) => cardId(value) === cardId(card));
    this.move(playCard(this.game, cardId(card)), `Played ${cardName(card)}.`);
    await this.updateComplete;
    const buttons = this.renderRoot.querySelectorAll<HTMLButtonElement>(".hand button");
    (
      buttons[Math.min(index, buttons.length - 1)] ??
      this.renderRoot.querySelector<HTMLButtonElement>("#draw-card:not(:disabled)") ??
      this.renderRoot.querySelector<HTMLButtonElement>("#new-deck")
    )?.focus({ preventScroll: true });
  }

  private undo(): void {
    const previous = this.history.at(-1);
    if (!previous) return;
    this.animateChange(() => {
      this.game = previous.game;
      this.sortOrder = previous.sortOrder;
      this.history = this.history.slice(0, -1);
      this.confirmingReset = false;
      this.message = "Last move undone.";
    });
  }

  private async reset(): Promise<void> {
    this.animateChange(
      () => {
        this.game = newGame();
        this.sortOrder = "draw-order";
        this.history = [];
        this.confirmingReset = false;
        this.message = "New deck shuffled. Draw a card to begin.";
      },
      undefined,
      true,
    );
    await this.updateComplete;
    this.renderRoot.querySelector<HTMLButtonElement>("#draw-card")?.focus({ preventScroll: true });
  }

  private async reorder(id: string, destination?: number, preview?: HTMLElement): Promise<void> {
    if (!this.game) return;
    const card = this.game.hand.find((card) => cardId(card) === id);
    const next =
      destination === undefined
        ? this.game
        : reorderHand(this.game, id, destination, this.sortOrder);
    if (!card) {
      preview?.remove();
      return;
    }
    if (next === this.game) {
      if (preview) this.animateChange(() => {}, preview);
      return;
    }
    this.move(
      next,
      `Moved ${cardName(card)} to position ${destination! + 1} of ${next.hand.length}.`,
      preview,
      "manual",
    );
    await this.updateComplete;
    this.renderRoot
      .querySelector<HTMLButtonElement>(`[data-card-id="${id}"]`)
      ?.focus({ preventScroll: true });
  }

  private reorderKey(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      this.handDrag.cancel();
      return;
    }
    if (!event.altKey || !this.game) return;
    const source = (event.target as Element).closest<HTMLButtonElement>("[data-card-id]");
    const id = source?.dataset.cardId;
    if (!id) return;
    const hand = handCards(this.game, this.sortOrder);
    const index = hand.findIndex((card) => cardId(card) === id);
    const destinations: Record<string, number> = {
      ArrowLeft: index - 1,
      ArrowRight: index + 1,
      Home: 0,
      End: hand.length - 1,
    };
    const destination = destinations[event.key];
    if (destination === undefined) return;
    event.preventDefault();
    void this.reorder(id, destination);
  }

  private cardFace(card: Card) {
    return html`<span class="flight-flipper" aria-hidden="true">
      <span class="card face flight-front" data-suit=${card.suit}>
        <span class="rank">${card.rank}</span>
        <span class="suit">${SUIT_SYMBOLS[card.suit]}</span>
        <span class="rank bottom">${card.rank}</span>
      </span>
      <span class="card back flight-back">✦</span>
    </span>`;
  }

  private layoutSwitch() {
    return html`<div class="layout-switch" role="group" aria-label="Hand layout">
      <button
        type="button"
        aria-label="Fan layout"
        aria-pressed=${this.handLayout === "fan"}
        @click=${() => this.setLayout("fan")}
      >
        ${unsafeHTML(buildLucideSvg(PlayingCards, { hasA11yProp: false }))}
        <span class="layout-tooltip" role="tooltip">Fan layout</span>
      </button>
      <button
        type="button"
        aria-label="Grid layout"
        aria-pressed=${this.handLayout === "grid"}
        @click=${() => this.setLayout("grid")}
      >
        ${unsafeHTML(buildLucideSvg(Grid3x3, { hasA11yProp: false }))}
        <span class="layout-tooltip" role="tooltip">Grid layout</span>
      </button>
    </div>`;
  }

  private flipSwitch() {
    return html`<div class="layout-switch" role="group" aria-label="Draw flip direction">
      <button
        type="button"
        aria-label="Horizontal flip"
        aria-pressed=${this.flipAxis === "X"}
        @click=${() => {
          this.flipAxis = "X";
        }}
      >
        ${unsafeHTML(buildLucideSvg(FoldVertical, { hasA11yProp: false }))}
        <span class="layout-tooltip" role="tooltip">Flip around horizontal axis</span>
      </button>
      <button
        type="button"
        aria-label="Vertical flip"
        aria-pressed=${this.flipAxis === "Y"}
        @click=${() => {
          this.flipAxis = "Y";
        }}
      >
        ${unsafeHTML(buildLucideSvg(FoldHorizontal, { hasA11yProp: false }))}
        <span class="layout-tooltip" role="tooltip">Flip around vertical axis</span>
      </button>
    </div>`;
  }

  private setLayout(layout: "fan" | "grid"): void {
    if (layout === this.handLayout) return;
    this.animateChange(() => {
      this.handLayout = layout;
    });
  }

  protected render() {
    if (!this.game) return nothing;
    const { deck, hand, played } = this.game;
    const top = played.at(-1);
    const fan =
      this.handLayout === "fan"
        ? fanLayout(
            hand.length,
            this.handWidth,
            parseFloat(getComputedStyle(document.documentElement).fontSize) / 16,
          )
        : undefined;
    return html` <div class="game" aria-label="Single-player card table">
      <div class="toolbar">
        <p class="mode">Single player · Free play</p>
        <div class="controls">
          <button type="button" @click=${this.undo} ?disabled=${!this.history.length}>Undo</button>
          <button
            id="new-deck"
            type="button"
            @click=${() => {
              if (this.history.length) this.confirmingReset = !this.confirmingReset;
              else void this.reset();
            }}
          >
            New deck
          </button>
        </div>
      </div>
      ${
        this.confirmingReset
          ? html` <div class="reset" role="group" aria-label="Confirm new deck">
              <span>Replace this game with a shuffled deck?</span>
              <button type="button" @click=${this.reset}>Shuffle new deck</button>
              <button
                type="button"
                @click=${() => {
                  this.confirmingReset = false;
                }}
              >
                Keep playing
              </button>
            </div>`
          : nothing
      }
      <div class="table">
        <div class="pile">
          <button
            id="draw-card"
            class="card back"
            type="button"
            aria-label="Draw a card"
            @click=${this.draw}
            ?disabled=${!deck.length}
          >
            <span aria-hidden="true">${deck.length ? "✦" : "Empty"}</span>
          </button>
          <span>Deck <strong>${deck.length}</strong></span>
        </div>
        <div class="pile played-pile">
          ${
            top
              ? html`<div
                  class="card card-shell"
                  data-suit=${top.suit}
                  data-motion-id=${cardId(top)}
                  role="img"
                  aria-label=${`Last played: ${cardName(top)}`}
                >
                  ${this.cardFace(top)}
                </div>`
              : html`<div class="card empty" aria-label="No cards played">Played<br />cards</div>`
          }
          <span>Played <strong>${played.length}</strong></span>
        </div>
      </div>
      <div class="hand-heading">
        <h3>Your hand <span>(${hand.length})</span></h3>
        <div class="hand-controls">
          ${this.layoutSwitch()} ${this.flipSwitch()}
          <label
            >Sort
            <select
              aria-label="Sort"
              .value=${this.sortOrder}
              @change=${(event: Event) => {
                this.animateChange(() => {
                  this.sortOrder = (event.target as HTMLSelectElement).value as SortOrder;
                });
              }}
            >
              <option value="draw-order">Draw order</option>
              <option value="manual">Manual order</option>
              <option value="rank-then-suit">Rank, then suit</option>
              <option value="suit-then-rank">Suit, then rank</option>
            </select>
          </label>
        </div>
      </div>
      <p class="hand-help" id="hand-help">
        Drag cards to rearrange them. Click to play. With a card focused, use Alt + Left/Right to
        move it.
      </p>
      ${
        hand.length
          ? html`<ul
              class="hand"
              data-layout=${this.handLayout}
              style=${fan ? `height:${fan.height}px` : ""}
              aria-label="Your hand"
              @pointerdown=${(event: PointerEvent) => {
                const card = (event.target as Element).closest<HTMLElement>("[data-card-id]");
                if (card?.dataset.cardId) this.cardMotion.finishCard(card.dataset.cardId);
                this.handDrag.pointerDown(event);
              }}
              @pointermove=${this.handDrag.pointerMove}
              @pointerup=${this.handDrag.pointerUp}
              @pointercancel=${this.handDrag.pointerCancel}
              @lostpointercapture=${this.handDrag.pointerCancel}
              @keydown=${this.reorderKey}
            >
              ${repeat(
                handCards(this.game, this.sortOrder),
                cardId,
                (card, index) => html`<li
                  style=${fan ? `--fan-x:${fan.slots[index].x}px;--fan-y:${fan.slots[index].y}px;--fan-order:${index}` : ""}
                >
                  <button
                    class="card card-shell"
                    type="button"
                    data-suit=${card.suit}
                    data-card-id=${cardId(card)}
                    data-motion-id=${cardId(card)}
                    data-rest-angle=${fan?.slots[index].angle ?? 0}
                    style=${`--card-angle:${fan?.slots[index].angle ?? 0}deg`}
                    aria-describedby="hand-help"
                    aria-label=${`Play ${cardName(card)}`}
                    @click=${(event: MouseEvent) => {
                      if (!this.handDrag.consumeClick(event)) void this.play(card);
                    }}
                  >
                    ${this.cardFace(card)}
                  </button>
                </li>`,
              )}
            </ul>`
          : html`<p class="empty-hand">
              ${
                deck.length
                  ? "Your hand is empty. Draw a card from the deck."
                  : "All cards played. Start a new deck whenever you like."
              }
            </p>`
      }
      <p class="status" role="status" aria-live="polite" aria-atomic="true">${this.message}</p>
      <details>
        <summary>How to play</summary>
        <p>
          Draw cards from the deck, then select a card in your hand to play it. Sort your hand, undo
          a move, or start a new shuffled deck at any time. Aces sort low. This is a free-play table
          with no scoring or opponents.
        </p>
        <p>
          Drag a card to the marked position to arrange your hand. Dropping outside your hand or
          pressing Escape cancels the drag. Manual order keeps your arrangement when drawing more
          cards. Alt + Home/End moves a focused card to the first/last position.
        </p>
        <p>Your game stays in this tab and resets when you reload the page.</p>
      </details>
    </div>`;
  }

  static styles = css`
    :host {
      display: block;
      min-width: 0;
      color: var(--color-text, #202820);
      font-family: inherit;
    }
    * {
      box-sizing: border-box;
    }
    .game {
      padding: clamp(1rem, 3vw, 2rem);
      border: 1px solid var(--color-border, #d0d8d0);
      border-radius: 1rem;
      background: var(--color-surface, #f7f9f5);
    }
    .toolbar,
    .controls,
    .hand-controls,
    .hand-heading,
    .reset {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
    }
    .toolbar,
    .hand-heading {
      justify-content: space-between;
    }
    .mode,
    .status,
    details,
    .empty-hand {
      color: var(--color-muted, #506050);
    }
    .mode {
      margin: 0;
      font-size: 0.875rem;
    }
    button,
    select {
      font: inherit;
      color: inherit;
      border: 1px solid var(--color-border-strong, #859585);
      border-radius: 0.5rem;
      background: var(--color-background, #fff);
      padding: 0.5rem 0.75rem;
      min-height: 2.75rem;
    }
    button,
    summary,
    select {
      cursor: pointer;
    }
    button:disabled {
      cursor: default;
      opacity: 0.5;
    }
    button:hover:not(:disabled),
    select:hover {
      border-color: var(--color-text, #202820);
    }
    button:focus-visible,
    select:focus-visible,
    summary:focus-visible {
      outline: 3px solid var(--color-primary, #386541);
      outline-offset: 4px;
    }
    .reset {
      margin-top: 1rem;
      padding: 0.75rem;
      border: 1px solid var(--color-border, #d0d8d0);
      border-radius: 0.5rem;
    }
    .table {
      display: flex;
      justify-content: center;
      gap: clamp(2rem, 8vw, 6rem);
      margin-block: 1.5rem;
      padding: 1.5rem 1rem;
      border-radius: 0.75rem;
      background: var(--color-hover, #e9efe7);
    }
    .pile {
      display: grid;
      justify-items: center;
      gap: 0.75rem;
      font-size: 0.875rem;
    }
    .pile strong {
      margin-left: 0.25rem;
      font-variant-numeric: tabular-nums;
    }
    .card {
      width: 4.5rem;
      height: 6.5rem;
      padding: 0.375rem;
      border-radius: 0.5rem;
    }
    .face {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      color: #202820;
      background: #fffdf8;
      border: 1px solid #778273;
      font-weight: 700;
    }
    .face[data-suit="Hearts"],
    .face[data-suit="Diamonds"] {
      color: #af2537;
    }
    .rank {
      align-self: flex-start;
      line-height: 1;
      font-size: 1rem;
    }
    .suit {
      align-self: center;
      font-size: 1.75rem;
      line-height: 1;
    }
    .bottom {
      align-self: flex-end;
      transform: rotate(180deg);
    }
    .back {
      color: #fffdf8;
      background: repeating-linear-gradient(
        45deg,
        #355342 0px,
        #355342 5px,
        #42634e 5px,
        #42634e 7px
      );
      border: 3px double #d8e4d8;
      font-size: 1.75rem;
    }
    .back:disabled {
      font-size: 0.875rem;
    }
    .empty {
      display: grid;
      place-content: center;
      text-align: center;
      border: 1px dashed var(--color-border-strong, #859585);
    }
    h3 {
      margin: 0;
      font-size: 1rem;
    }
    h3 span {
      font-weight: 400;
    }
    label {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.5rem;
      font-size: 0.875rem;
    }
    .hand {
      display: flex;
      flex-wrap: wrap;
      gap: 0.625rem;
      margin: 1rem 0;
      padding: 0;
      list-style: none;
      isolation: isolate;
    }
    .hand[data-layout="fan"] {
      display: block;
      position: relative;
      --hover-lift: 1rem;
    }
    .hand[data-layout="fan"] > li {
      position: absolute;
      left: var(--fan-x);
      top: var(--fan-y);
      z-index: var(--fan-order);
    }
    .hand > li:has([data-in-flight]) {
      z-index: 100;
    }
    .hand > li:has(button:hover),
    .hand > li:focus-within {
      z-index: 101;
    }
    .hand > li > .card {
      transition: transform 240ms ease;
      will-change: transform;
      position: relative;
      touch-action: none;
      user-select: none;
      cursor: grab;
      transform: rotate(var(--card-angle, 0deg));
    }
    .hand-help {
      font-size: 0.875rem;
      color: var(--color-muted, #506050);
      line-height: 1.5;
    }
    .hand[data-dragging] > li > .card {
      transform: rotate(var(--card-angle, 0deg));
      cursor: grabbing;
    }
    .hand > li > .card[data-drag-source] {
      opacity: 0.35;
    }
    .card[data-drop-side]::after {
      content: "";
      position: absolute;
      width: 3px;
      top: -0.25rem;
      bottom: -0.25rem;
      z-index: 101;
      background: var(--color-primary, #386541);
      border-radius: 2px;
    }
    .card[data-drop-side="before"]::after {
      left: -0.45rem;
    }
    .card[data-drop-side="after"]::after {
      right: -0.45rem;
    }
    .drag-preview,
    .card-flight[data-flight-ghost] {
      position: fixed;
      left: 0;
      top: 0;
      z-index: 100;
      pointer-events: none;
      margin: 0;
      box-shadow: 0 0.5rem 1.5rem #0004;
      will-change: transform;
      cursor: grabbing;
    }
    .card-flight {
      z-index: 100;
      pointer-events: none;
    }
    .card-shell {
      padding: 0;
      border: 0;
      background: transparent;
      box-shadow: none;
      perspective: 600px;
    }
    .flight-flipper {
      display: block;
      position: relative;
      width: 100%;
      height: 100%;
      transform-style: preserve-3d;
      transform: rotateY(0deg);
      will-change: transform;
    }
    .flight-front,
    .flight-back {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      backface-visibility: hidden;
    }
    .drag-preview .flight-front {
      box-shadow: 0 0.5rem 1.5rem #0004;
    }
    .flight-back {
      display: grid;
      place-items: center;
      transform: rotateY(180deg);
    }
    .flight-flipper[data-flip-axis="X"] > .flight-back {
      transform: rotateX(180deg);
    }
    .hand > li > .card:hover,
    .hand > li > .card:focus-visible {
      transform: translateY(calc(-1 * var(--hover-lift, 0.25rem))) rotate(var(--card-angle, 0deg));
    }
    .hand[data-dragging] > li > .card:hover,
    .hand[data-dragging] > li > .card:focus-visible {
      transform: rotate(var(--card-angle, 0deg));
    }
    .hand > li > .card[data-in-flight] {
      transform: rotate(var(--card-angle, 0deg));
      transition: none;
    }
    .layout-switch {
      display: inline-flex;
      position: relative;
      gap: 0.125rem;
      padding: 0.125rem;
      border: 1px solid var(--color-border, #d0d8d0);
      border-radius: 0.625rem;
    }
    .layout-switch::before {
      content: "";
      position: absolute;
      inset-block: 0.125rem;
      left: 0.125rem;
      width: 2.5rem;
      border-radius: 0.5rem;
      background: var(--color-hover, #e9efe7);
      pointer-events: none;
      transform: translateX(0);
      transition: transform 420ms cubic-bezier(0.22, 1, 0.36, 1);
    }
    .layout-switch:has(button:nth-child(2)[aria-pressed="true"])::before {
      transform: translateX(calc(100% + 0.125rem));
    }
    .layout-switch button {
      display: grid;
      place-items: center;
      position: relative;
      width: 2.5rem;
      min-height: 2.5rem;
      padding: 0.375rem;
      border: 0;
      background: transparent;
      color: var(--color-muted, #506050);
    }
    .layout-switch button[aria-pressed="true"] {
      color: var(--color-text, #202820);
    }
    .layout-switch svg {
      width: 1.5rem;
      height: 1.5rem;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
    }
    .layout-tooltip {
      position: absolute;
      top: calc(100% + 0.5rem);
      left: 50%;
      transform: translateX(-50%);
      z-index: 200;
      padding: 0.375rem 0.625rem;
      border-radius: 0.375rem;
      color: var(--color-background, #fff);
      background: var(--color-text, #202820);
      font-size: 0.75rem;
      white-space: nowrap;
      visibility: hidden;
      pointer-events: none;
    }
    .layout-switch button:hover .layout-tooltip,
    .layout-switch button:focus-visible .layout-tooltip {
      visibility: visible;
    }
    .empty-hand {
      padding-block: 1rem;
    }
    .status {
      min-height: 1.5em;
      font-size: 0.875rem;
    }
    details {
      border-top: 1px solid var(--color-border, #d0d8d0);
      padding-top: 0.875rem;
      font-size: 0.875rem;
      line-height: 1.6;
    }
    details p {
      max-width: 70ch;
    }
    summary {
      width: fit-content;
    }
    @media (prefers-reduced-motion: reduce) {
      .layout-switch::before,
      .hand > li > .card {
        transition: none;
      }
    }
  `;
}

if (!customElements.get("card-game")) customElements.define("card-game", CardGame);

declare global {
  interface HTMLElementTagNameMap {
    "card-game": CardGame;
  }
}

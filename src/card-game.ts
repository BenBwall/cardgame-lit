import { cardTableStyles } from "./card-table-styles.js";
import { LitElement, html, nothing } from "lit";
import { ArrowDown, ArrowUp, ArrowRight, ArrowLeft, Grid3x3, PlayingCards } from "@lucide/icons";
import { buildLucideSvg } from "@lucide/icons/build";
import { repeat } from "lit/directives/repeat.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { type Card, type SortOrder, cardId, cardName } from "./cards.js";
import {
  type CardArtwork,
  defaultArtwork,
  isArtwork,
  applyArtwork,
  faceContents,
  type BackAssignments,
  newBackAssignments,
  isBackAssignments,
  cardBackStyle,
} from "./card-art.js";
import "./card-appearance.js";
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
import { HandSizeMotion } from "./hand-size-motion.js";
import "./shithead-game.js";
import {
  gameStorageKey,
  readSavedGame,
  writeSavedGame,
  isFreeGame,
  isSortOrder,
  record,
} from "./saved-game.js";

const flipOptions = [
  { label: "Top to bottom", icon: ArrowDown, axis: "X", startAngle: 180 },
  { label: "Bottom to top", icon: ArrowUp, axis: "X", startAngle: -180 },
  { label: "Left to right", icon: ArrowRight, axis: "Y", startAngle: -180 },
  { label: "Right to left", icon: ArrowLeft, axis: "Y", startAngle: 180 },
] as const;

/** Import this module once, then use <card-game> anywhere on a static page. */
export class CardGame extends LitElement {
  static properties = {
    storageKey: { attribute: "storage-key" },
    artwork: { state: true },
    artworkError: { state: true },
    saveFailed: { state: true },
    mode: { state: true },
    game: { state: true },
    history: { state: true },
    sortOrder: { state: true },
    message: { state: true },
    confirmingReset: { state: true },
    handLayout: { state: true },
    flipDirection: { state: true },
    handWidth: { state: true },
  };

  private game: GameState | undefined;
  storageKey = "";
  private artwork: CardArtwork = defaultArtwork();
  private artworkError = "";
  private backAssignments: BackAssignments = {};
  private restored = false;
  private saveFailed = false;
  private mode: "free-play" | "shithead" = "free-play";
  private history: { game: GameState; sortOrder: SortOrder }[] = [];
  private sortOrder: SortOrder = "draw-order";
  private message = "Draw a card to begin.";
  private confirmingReset = false;
  private handLayout: "fan" | "grid" = "fan";
  private flipDirection = 0;
  private handWidth = 600;
  private resizeObserver?: ResizeObserver;
  private handSizeMotion = new HandSizeMotion(() => this.renderRoot);
  private cardMotion = new CardMotion(
    () => this.renderRoot,
    () => flipOptions[this.flipDirection],
  );
  private handDrag = new HandDrag((id, destination, preview) => {
    void this.reorder(id, destination, preview);
  });

  // Randomness belongs to a browser instance, never the static build or shared state.
  connectedCallback(): void {
    super.connectedCallback();
    this.storageKey ||= gameStorageKey(this, "table");
    if (!this.restored) {
      this.restored = true;
      const art = readSavedGame(`${this.storageKey}:artwork`);
      if (isArtwork(art)) this.artwork = art;
      applyArtwork(this, this.artwork);
      const saved = readSavedGame(this.storageKey);
      this.backAssignments =
        isFreeGame(saved?.game) && isBackAssignments(saved?.backAssignments)
          ? saved.backAssignments
          : newBackAssignments();
      if (saved) {
        if (isFreeGame(saved.game)) this.game = saved.game;
        if (saved.mode === "shithead" || saved.mode === "free-play") this.mode = saved.mode;
        if (isSortOrder(saved.sortOrder)) this.sortOrder = saved.sortOrder;
        if (saved.handLayout === "fan" || saved.handLayout === "grid")
          this.handLayout = saved.handLayout;
        if (
          Number.isInteger(saved.flipDirection) &&
          Number(saved.flipDirection) >= 0 &&
          Number(saved.flipDirection) < 4
        )
          this.flipDirection = Number(saved.flipDirection);
        if (this.game && typeof saved.message === "string")
          this.message = saved.message.slice(0, 4096);
        if (this.game && Array.isArray(saved.history))
          this.history = saved.history
            .slice(-200)
            .flatMap((entry) =>
              record(entry) && isFreeGame(entry.game) && isSortOrder(entry.sortOrder)
                ? [{ game: entry.game, sortOrder: entry.sortOrder }]
                : [],
            );
      }
    }
    this.game ??= newGame();
    window.addEventListener("pagehide", this.save);
    this.cardMotion.connect();
    void this.updateComplete.then(() => {
      if (!this.isConnected) return;
      this.handSizeMotion.connect();
      this.resizeObserver ??= new ResizeObserver(([entry]) => {
        if (Math.abs(this.handWidth - entry.contentRect.width) < 0.5) return;
        this.cardMotion.finish();
        this.handWidth = entry.contentRect.width;
      });
      this.resizeObserver.observe(this.renderRoot.querySelector(".game")!);
    });
  }

  disconnectedCallback(): void {
    this.save();
    window.removeEventListener("pagehide", this.save);
    this.handDrag.dispose();
    this.cardMotion.disconnect();
    this.resizeObserver?.disconnect();
    this.handSizeMotion.disconnect();
    super.disconnectedCallback();
  }

  protected updated(): void {
    this.save();
  }
  private save = (): void => {
    if (!this.game || !this.storageKey) return;
    this.saveFailed = !writeSavedGame(this.storageKey, {
      game: this.game,
      mode: this.mode,
      sortOrder: this.sortOrder,
      handLayout: this.handLayout,
      flipDirection: this.flipDirection,
      history: this.history.slice(-200),
      message: this.message,
      backAssignments: this.backAssignments,
    });
  };

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
        this.backAssignments = newBackAssignments();
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
      <span class="card face flight-front" data-suit=${card.suit}> ${faceContents(card)} </span>
      <span class="card back flight-back" style=${cardBackStyle(card, this.backAssignments)}
        ><span class="back-mark">✦</span></span
      >
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
    return html`<div
      class="layout-switch flip-switch"
      role="group"
      aria-label="Draw flip direction"
    >
      ${flipOptions.map(
        (option, index) => html`<button
          type="button"
          aria-label=${option.label}
          aria-pressed=${this.flipDirection === index}
          @click=${() => {
            this.flipDirection = index;
          }}
        >
          ${unsafeHTML(buildLucideSvg(option.icon, { hasA11yProp: false }))}
          <span class="layout-tooltip" role="tooltip">${option.label}</span>
        </button>`,
      )}
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
    return html`<div class="game" aria-label="Single-player card table">
      <label class="mode-select"
        >Game
        <select
          aria-label="Game"
          .value=${this.mode}
          @change=${(event: Event) => {
            this.handDrag.dispose();
            this.cardMotion.finish();
            this.handSizeMotion.disconnect();
            this.mode = (event.target as HTMLSelectElement).value as "free-play" | "shithead";
            void this.updateComplete.then(() => {
              if (this.isConnected && this.mode === "free-play") this.handSizeMotion.connect();
            });
          }}
        >
          <option value="free-play">Free play</option>
          <option value="shithead">Shithead · vs computer</option>
        </select>
      </label>
      <card-appearance
        .value=${this.artwork}
        .saveError=${this.artworkError}
        @artwork-change=${(event: CustomEvent<CardArtwork>) => {
          if (!isArtwork(event.detail)) return;
          if (!writeSavedGame(`${this.storageKey}:artwork`, event.detail)) {
            this.artworkError =
              "These images could not be saved. Browser storage may be full or unavailable. Your previous artwork is unchanged.";
            return;
          }
          this.artworkError = "";
          this.handDrag.dispose();
          this.cardMotion.finish();
          this.artwork = event.detail;
          applyArtwork(this, this.artwork);
        }}
      ></card-appearance>
      ${this.saveFailed ? html`<p>Browser storage is unavailable. This game cannot be saved.</p>` : nothing}
      ${this.mode === "shithead" ? html`<shithead-game .storageKey=${`${this.storageKey}:shithead`} .randomBacks=${this.artwork.back === "wildlife"}></shithead-game>` : this.renderFreePlay()}
    </div>`;
  }

  private renderFreePlay() {
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
    return html`<div>
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
            style=${cardBackStyle(deck.at(-1), this.backAssignments)}
            class="card back"
            type="button"
            aria-label="Draw a card"
            @click=${this.draw}
            ?disabled=${!deck.length}
          >
            ${
              deck.length
                ? html`<span class="back-mark" aria-hidden="true">✦</span>`
                : html`<span aria-hidden="true">Empty</span>`
            }
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
      <div class="hand-region">
        <div class="hand-content">
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
        </div>
      </div>
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
        <p>Your game and settings are saved in this browser and restored when you return.</p>
      </details>
    </div>`;
  }

  static styles = cardTableStyles;
}

if (!customElements.get("card-game")) customElements.define("card-game", CardGame);

declare global {
  interface HTMLElementTagNameMap {
    "card-game": CardGame;
  }
}

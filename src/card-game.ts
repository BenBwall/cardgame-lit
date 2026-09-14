import { LitElement, css, html, nothing } from "lit";
import { type Card, type SortOrder, SUIT_SYMBOLS, cardId, cardName, sortCards } from "./cards.js";
import { type GameState, drawCard, newGame, playCard } from "./game-state.js";

/** Import this module once, then use <card-game> anywhere on a static page. */
export class CardGame extends LitElement {
  static properties = {
    game: { state: true },
    history: { state: true },
    sortOrder: { state: true },
    message: { state: true },
    confirmingReset: { state: true },
  };

  private game: GameState | undefined;
  private history: GameState[] = [];
  private sortOrder: SortOrder = "draw-order";
  private message = "Draw a card to begin.";
  private confirmingReset = false;

  // Randomness belongs to a browser instance, never the static build or shared state.
  connectedCallback(): void {
    super.connectedCallback();
    this.game ??= newGame();
  }

  private move(next: GameState, message: string): void {
    if (!this.game || next === this.game) return;
    this.history = [...this.history, this.game];
    this.game = next;
    this.confirmingReset = false;
    this.message =
      next.deck.length === 0 && next.hand.length === 0
        ? "All 52 cards played. Start a new deck to play again."
        : message;
  }

  private draw(): void {
    if (!this.game) return;
    const next = drawCard(this.game);
    const card = next.hand.at(-1);
    if (card) this.move(next, `Drew ${cardName(card)}.`);
  }

  private async play(card: Card): Promise<void> {
    if (!this.game) return;
    const hand = sortCards(this.game.hand, this.sortOrder);
    const index = hand.findIndex((value) => cardId(value) === cardId(card));
    this.move(playCard(this.game, cardId(card)), `Played ${cardName(card)}.`);
    await this.updateComplete;
    const buttons = this.renderRoot.querySelectorAll<HTMLButtonElement>(".hand button");
    (
      buttons[Math.min(index, buttons.length - 1)] ??
      this.renderRoot.querySelector<HTMLButtonElement>("#draw-card:not(:disabled)") ??
      this.renderRoot.querySelector<HTMLButtonElement>("#new-deck")
    )?.focus();
  }

  private undo(): void {
    const previous = this.history.at(-1);
    if (!previous) return;
    this.game = previous;
    this.history = this.history.slice(0, -1);
    this.confirmingReset = false;
    this.message = "Last move undone.";
  }

  private async reset(): Promise<void> {
    this.game = newGame();
    this.history = [];
    this.confirmingReset = false;
    this.message = "New deck shuffled. Draw a card to begin.";
    await this.updateComplete;
    this.renderRoot.querySelector<HTMLButtonElement>("#draw-card")?.focus();
  }

  private cardFace(card: Card) {
    return html`<span class="rank">${card.rank}</span>
      <span class="suit">${SUIT_SYMBOLS[card.suit]}</span>
      <span class="rank bottom">${card.rank}</span>`;
  }

  protected render() {
    if (!this.game) return nothing;
    const { deck, hand, played } = this.game;
    const top = played.at(-1);
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
        <div class="pile">
          ${
            top
              ? html`<div
                  class="card face"
                  data-suit=${top.suit}
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
        <label
          >Sort
          <select
            aria-label="Sort"
            .value=${this.sortOrder}
            @change=${(event: Event) => {
              this.sortOrder = (event.target as HTMLSelectElement).value as SortOrder;
            }}
          >
            <option value="draw-order">Draw order</option>
            <option value="rank-then-suit">Rank, then suit</option>
            <option value="suit-then-rank">Suit, then rank</option>
          </select>
        </label>
      </div>
      ${
        hand.length
          ? html`<ul class="hand" aria-label="Your hand">
              ${sortCards(hand, this.sortOrder).map(
                (card) => html`<li>
                  <button
                    class="card face"
                    type="button"
                    data-suit=${card.suit}
                    aria-label=${`Play ${cardName(card)}`}
                    @click=${() => this.play(card)}
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
    }
    .hand .card {
      transition: transform 120ms ease;
    }
    .hand .card:hover,
    .hand .card:focus-visible {
      transform: translateY(-0.25rem);
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
      .hand .card {
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

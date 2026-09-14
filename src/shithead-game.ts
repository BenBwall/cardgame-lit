import { LitElement, css, html, nothing, render } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { Grid3x3, PlayingCards, ArrowDown, ArrowUp, ArrowRight, ArrowLeft } from "@lucide/icons";
import { buildLucideSvg } from "@lucide/icons/build";
import { type Card, type SortOrder, SUIT_SYMBOLS, cardId, cardName } from "./cards.js";
import { handCards, reorderHand, type GameState } from "./game-state.js";
import { HandDrag } from "./hand-drag.js";
import { HandSizeMotion } from "./hand-size-motion.js";
import { fanLayout } from "./hand-layout.js";
import { cardTableStyles } from "./card-table-styles.js";
import {
  faceContents,
  artLayer,
  type BackAssignments,
  newBackAssignments,
  isBackAssignments,
  cardBackStyle,
} from "./card-art.js";
import { ShitheadMotion } from "./shithead-motion.js";
import {
  gameStorageKey,
  readSavedGame,
  writeSavedGame,
  isShitheadGame,
  isSortOrder,
  isRules,
} from "./saved-game.js";
import {
  type ShitheadState,
  type ShitheadRules,
  DEFAULT_SHITHEAD_RULES,
  canPickupShithead,
  shitheadSlots,
  autoShithead,
  canPlayShithead,
  newShithead,
  pickupShithead,
  playShithead,
  shitheadSource,
  startShithead,
  swapShithead,
} from "./shithead-state.js";

const flipOptions = [
  { label: "Top to bottom", icon: ArrowDown, axis: "X", startAngle: 180 },
  { label: "Bottom to top", icon: ArrowUp, axis: "X", startAngle: -180 },
  { label: "Left to right", icon: ArrowRight, axis: "Y", startAngle: -180 },
  { label: "Right to left", icon: ArrowLeft, axis: "Y", startAngle: 180 },
] as const;

export class ShitheadGame extends LitElement {
  static properties = {
    storageKey: { attribute: "storage-key" },
    randomBacks: { type: Boolean, reflect: true, attribute: "random-backs" },
    saveFailed: { state: true },
    previewPile: { state: true },
    game: { state: true },
    selected: { state: true },
    swapHand: { state: true },
    confirming: { state: true },
    tab: { state: true },
    rules: { state: true },
    busy: { state: true },
    handLayout: { state: true },
    sortOrder: { state: true },
    handOrder: { state: true },
    handWidth: { state: true },
    selecting: { state: true },
    flipDirection: { state: true },
  };
  private game?: ShitheadState;
  storageKey = "";
  randomBacks = false;
  private backAssignments: BackAssignments = {};
  private restored = false;
  private saveFailed = false;
  private previewPile: "pile" | "burned" | null = null;
  private previewCloseTimer?: ReturnType<typeof setTimeout>;
  private selected: string[] = [];
  private swapHand = "";
  private selecting = false;
  private confirming = false;
  private tab: "table" | "options" = "table";
  private rules: ShitheadRules = { ...DEFAULT_SHITHEAD_RULES };
  private busy = false;
  private handLayout: "fan" | "grid" = "fan";
  private sortOrder: SortOrder = "draw-order";
  private handOrder: string[] = [];
  private handWidth = 600;
  private flipDirection = 0;
  private computerTimer?: ReturnType<typeof setTimeout>;
  private observer?: ResizeObserver;
  private transition = 0;
  private motion = new ShitheadMotion(
    () => this.shadowRoot!,
    (card) => {
      const node = document.createElement("div");
      render(this.face(card), node);
      return node;
    },
    () => flipOptions[this.flipDirection],
    (card) => cardBackStyle(card, this.backAssignments),
  );
  private handSizeMotion = new HandSizeMotion(() => this.renderRoot);
  private handDrag = new HandDrag((id, destination, preview) => {
    void this.reorder(id, destination, preview);
  });

  connectedCallback(): void {
    super.connectedCallback();
    this.storageKey ||= gameStorageKey(this, "shithead");
    if (!this.restored) {
      this.restored = true;
      const saved = readSavedGame(this.storageKey);
      this.backAssignments =
        isShitheadGame(saved?.game) && isBackAssignments(saved?.backAssignments)
          ? saved.backAssignments
          : newBackAssignments();
      if (saved) {
        if (isShitheadGame(saved.game)) this.game = saved.game;
        if (isRules(saved.rules)) this.rules = saved.rules;
        if (isSortOrder(saved.sortOrder)) this.sortOrder = saved.sortOrder;
        if (saved.handLayout === "fan" || saved.handLayout === "grid")
          this.handLayout = saved.handLayout;
        if (
          Number.isInteger(saved.flipDirection) &&
          Number(saved.flipDirection) >= 0 &&
          Number(saved.flipDirection) < 4
        )
          this.flipDirection = Number(saved.flipDirection);
        if (saved.tab === "options" || saved.tab === "table") this.tab = saved.tab;
        if (this.game) {
          const handIds = this.game.players[0].hand.map(cardId);
          if (Array.isArray(saved.handOrder))
            this.handOrder = [
              ...new Set(
                saved.handOrder.filter(
                  (id): id is string => typeof id === "string" && handIds.includes(id),
                ),
              ),
            ];
          if (
            typeof saved.swapHand === "string" &&
            this.game.phase === "setup" &&
            handIds.includes(saved.swapHand)
          )
            this.swapHand = saved.swapHand;
          const available = this.game.players[0][shitheadSource(this.game.players[0])];
          const selectedIds = saved.selected;
          if (
            this.game.phase === "playing" &&
            this.game.turn === 0 &&
            shitheadSource(this.game.players[0]) !== "faceDown" &&
            Array.isArray(selectedIds)
          ) {
            const selected = available.filter(
              (card) =>
                selectedIds.includes(cardId(card)) && canPlayShithead(card, this.game!.pile),
            );
            this.selected = selected.filter((card) => card.rank === selected[0]?.rank).map(cardId);
            this.selecting = saved.selecting === true;
          }
        }
      }
    }
    this.game ??= newShithead(Math.random, this.rules);
    window.addEventListener("pagehide", this.save);
    this.motion.connect();
    void this.updateComplete.then(() => {
      if (!this.isConnected) return;
      this.handSizeMotion.connect();
      this.observer = new ResizeObserver(([entry]) => {
        if (
          entry.contentRect.width > 0 &&
          Math.abs(this.handWidth - entry.contentRect.width) > 0.5
        ) {
          this.motion.finish();
          this.handWidth = entry.contentRect.width;
        }
      });
      this.observer.observe(this.renderRoot.querySelector(".hand-region")!);
    });
  }
  disconnectedCallback(): void {
    clearTimeout(this.previewCloseTimer);
    this.save();
    window.removeEventListener("pagehide", this.save);
    clearTimeout(this.computerTimer);
    this.computerTimer = undefined;
    this.handDrag.dispose();
    this.motion.disconnect();
    this.observer?.disconnect();
    this.handSizeMotion.disconnect();
    super.disconnectedCallback();
  }
  protected updated(): void {
    this.save();
    if (
      this.isConnected &&
      this.tab === "table" &&
      !this.busy &&
      !this.confirming &&
      this.game?.phase === "playing" &&
      this.game.turn === 1 &&
      !this.computerTimer
    ) {
      this.computerTimer = setTimeout(() => {
        this.computerTimer = undefined;
        if (this.isConnected && this.tab === "table" && !this.busy && this.game?.turn === 1)
          void this.commit(autoShithead(this.game));
      }, 650);
    }
  }
  private handState(): GameState {
    const game = this.game!;
    const ids = game.players[0].hand.map(cardId);
    return {
      deck: game.stock,
      played: game.pile,
      hand: game.players[0].hand,
      handOrder: [
        ...this.handOrder.filter((id) => ids.includes(id)),
        ...ids.filter((id) => !this.handOrder.includes(id)),
      ],
    };
  }
  private save = (): void => {
    if (!this.game || !this.storageKey) return;
    this.saveFailed = !writeSavedGame(this.storageKey, {
      game: this.game,
      rules: this.rules,
      handLayout: this.handLayout,
      sortOrder: this.sortOrder,
      handOrder: this.handOrder,
      flipDirection: this.flipDirection,
      tab: this.tab,
      selected: this.selected,
      selecting: this.selecting,
      swapHand: this.swapHand,
      backAssignments: this.backAssignments,
    });
  };
  private async commit(next: ShitheadState): Promise<void> {
    if (!this.game || next === this.game) return;
    const old = this.game,
      token = ++this.transition;
    clearTimeout(this.computerTimer);
    this.computerTimer = undefined;
    this.handDrag.dispose();
    const before = this.motion.capture();
    this.game = next;
    this.handOrder = [...this.handState().handOrder];
    this.selected = [];
    this.selecting = false;
    this.swapHand = "";
    this.busy = true;
    await this.updateComplete;
    if (this.isConnected && this.tab === "table" && token === this.transition)
      await this.motion.animate(before, old, next);
    if (token === this.transition) this.busy = false;
  }
  private reset(): void {
    clearTimeout(this.computerTimer);
    this.computerTimer = undefined;
    this.motion.finish();
    this.confirming = false;
    this.tab = "table";
    this.handOrder = [];
    this.backAssignments = newBackAssignments();
    // New deals reset the board together; normal moves animate between real positions.
    void this.commit(newShithead(Math.random, this.rules));
  }
  private changeTab(tab: "table" | "options"): void {
    clearTimeout(this.computerTimer);
    this.computerTimer = undefined;
    this.handDrag.dispose();
    this.motion.finish();
    this.tab = tab;
    void this.updateComplete.then(() =>
      this.renderRoot.querySelector<HTMLButtonElement>(`#${tab}-tab`)?.focus(),
    );
  }
  private changeRule(key: keyof ShitheadRules, value: boolean): void {
    this.rules = { ...this.rules, [key]: value };
    if (this.game?.phase === "setup") this.game = { ...this.game, rules: { ...this.rules } };
  }
  private options() {
    const options = [
      [
        "voluntaryPickup",
        "Allow voluntary pile pickup",
        "Pick up the pile even when you have a legal play. When off, you must play if able, or attempt a blind card.",
      ],
      [
        "playAgainAfterTwo",
        "Play again after a 2",
        "Playing a 2 gives the same player another turn after drawing back up to three cards.",
      ],
      [
        "revealUncovered",
        "Reveal the card underneath",
        "Playing a face-up card reveals the card directly below it. The revealed card becomes playable face up in that position.",
      ],
    ] as const;
    return html`<p>
        ${this.game?.phase === "setup" ? "Rules apply immediately to this deal and to both players." : "Changes apply to the next deal for both players. Your current game keeps its rules and pauses while Options is open."}
      </p>
      <div class="rule-options">
        ${options.map(
          ([key, label, help]) =>
            html`<label class="rule-option"
              ><input
                type="checkbox"
                aria-label=${label}
                .checked=${this.rules[key]}
                @change=${(event: Event) => this.changeRule(key, (event.target as HTMLInputElement).checked)}
                aria-describedby=${`help-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`}
              /><span
                ><strong>${label}</strong
                ><span
                  id=${`help-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`}
                  class="rule-help"
                  >${help}</span
                ></span
              ></label
            >`,
        )}
      </div>
      <p class="muted">Your game and options are saved in this browser.</p>
      ${this.game?.phase === "setup" ? html`<button @click=${() => this.changeTab("table")}>Back to table</button>` : html`<button @click=${this.reset}>Apply options and deal new game</button>`}`;
  }

  private async arrange(change: () => void, preview?: HTMLElement): Promise<void> {
    if (!this.game) return;
    const before = this.motion.capture(preview),
      state = this.game;
    change();
    await this.updateComplete;
    if (this.isConnected) await this.motion.animate(before, state, this.game);
  }
  private async reorder(id: string, destination?: number, preview?: HTMLElement): Promise<void> {
    if (!this.game || this.busy) {
      preview?.remove();
      return;
    }
    const state = this.handState();
    const next =
      destination === undefined ? state : reorderHand(state, id, destination, this.sortOrder);
    await this.arrange(() => {
      if (next !== state) {
        this.handOrder = [...next.handOrder];
        this.sortOrder = "manual";
      }
    }, preview);
    this.renderRoot
      .querySelector<HTMLButtonElement>(`[data-card-id="${id}"]`)
      ?.focus({ preventScroll: true });
  }
  private reorderKey(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      this.handDrag.cancel();
      this.selected = [];
      this.selecting = false;
      return;
    }
    if (!event.altKey || this.busy) return;
    const id = (event.target as Element).closest<HTMLElement>("[data-card-id]")?.dataset.cardId;
    if (!id) return;
    const cards = handCards(this.handState(), this.sortOrder),
      index = cards.findIndex((card) => cardId(card) === id);
    const destination = (
      { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: cards.length - 1 } as Record<
        string,
        number
      >
    )[event.key];
    if (destination !== undefined) {
      event.preventDefault();
      void this.reorder(id, destination);
    }
  }
  private activate(card: Card, kind: "hand" | "faceUp", event: MouseEvent): void {
    if (this.handDrag.consumeClick(event) || this.busy || !this.game) return;
    const game = this.game,
      id = cardId(card);
    if (game.phase === "setup") {
      if (kind === "hand") this.swapHand = this.swapHand === id ? "" : id;
      else if (this.swapHand) void this.commit(swapShithead(game, this.swapHand, id));
      return;
    }
    if (
      game.phase !== "playing" ||
      game.turn !== 0 ||
      shitheadSource(game.players[0]) !== kind ||
      !canPlayShithead(card, game.pile)
    )
      return;
    if (this.shouldSelect(card, kind) || event.shiftKey) {
      this.selecting = true;
      const sameRank =
        game.players[0][kind].find((card) => cardId(card) === this.selected[0])?.rank === card.rank;
      this.selected = this.selected.includes(id)
        ? this.selected.filter((value) => value !== id)
        : sameRank
          ? [...this.selected, id]
          : [id];
    } else void this.commit(playShithead(game, 0, [game.players[0][kind].indexOf(card)]));
  }
  private shouldSelect(card: Card, kind: "hand" | "faceUp"): boolean {
    return (
      this.selecting ||
      this.game!.players[0][kind].filter((value) => value.rank === card.rank).length > 1
    );
  }
  private playSelected(): void {
    if (!this.game || this.busy) return;
    const source = shitheadSource(this.game.players[0]);
    const indices = this.game.players[0][source].flatMap((card, index) =>
      this.selected.includes(cardId(card)) ? [index] : [],
    );
    void this.commit(playShithead(this.game, 0, indices));
  }
  private pilePreview(kind: "pile" | "burned", cards: readonly Card[]) {
    if (this.previewPile !== kind) return nothing;
    return html`<div class="pile-preview" id=${`${kind}-preview`} role="tooltip">
      <strong>${kind === "pile" ? "Play pile" : "Exile pile"} · ${cards.length}</strong>
      ${
        cards.length
          ? html`<span class="preview-order">Top card first</span>
              <ol class="preview-cards">
                ${[...cards].reverse().map(
                  (card) =>
                    html`<li
                      class="preview-card"
                      data-suit=${card.suit}
                      aria-label=${cardName(card)}
                    >
                      <span
                        aria-hidden="true"
                        style=${`visibility:var(--card-label-${cardId(card)},visible)`}
                        >${card.rank}<span>${SUIT_SYMBOLS[card.suit]}</span></span
                      >${artLayer(card)}
                    </li>`,
                )}
              </ol>`
          : html`<p>Empty pile</p>`
      }
    </div>`;
  }
  private openPilePreview(kind: "pile" | "burned"): void {
    clearTimeout(this.previewCloseTimer);
    this.previewPile = kind;
  }
  private closePilePreview(event: FocusEvent | PointerEvent): void {
    const wrapper = event.currentTarget as HTMLElement;
    const target =
      event.type === "focusout"
        ? (event as FocusEvent).relatedTarget
        : this.shadowRoot?.activeElement;
    if (!(target instanceof Node) || !wrapper.contains(target)) {
      clearTimeout(this.previewCloseTimer);
      if (event.type === "pointerleave")
        this.previewCloseTimer = setTimeout(() => {
          this.previewPile = null;
        }, 180);
      else this.previewPile = null;
    }
  }
  private dismissPilePreview(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      this.previewPile = null;
    }
  }
  private face(card: Card) {
    return html`<span class="flight-flipper" aria-hidden="true"
      ><span class="card face flight-front" data-suit=${card.suit}>${faceContents(card)}</span
      ><span class="card back flight-back" style=${cardBackStyle(card, this.backAssignments)}
        >✦</span
      ></span
    >`;
  }
  private cardButton(card: Card, kind: "hand" | "faceUp", angle = 0) {
    const game = this.game!,
      setup = game.phase === "setup";
    const playable =
      !this.busy &&
      (setup
        ? kind === "hand" || !!this.swapHand
        : game.phase === "playing" &&
          game.turn === 0 &&
          shitheadSource(game.players[0]) === kind &&
          canPlayShithead(card, game.pile));
    return html`<button
      class="card card-shell"
      type="button"
      data-card-id=${kind === "hand" ? cardId(card) : nothing}
      data-board-key=${this.motion.key(card)}
      data-rest-angle=${angle}
      style=${`--card-angle:${angle}deg`}
      data-playable=${playable}
      aria-disabled=${!playable}
      aria-label=${`${setup ? "Swap" : this.shouldSelect(card, kind) ? "Select" : "Play"} ${cardName(card)}`}
      aria-pressed=${setup ? this.swapHand === cardId(card) : this.selected.includes(cardId(card))}
      @click=${(event: MouseEvent) => this.activate(card, kind, event)}
    >
      ${this.face(card)}
    </button>`;
  }
  private tableCards(index: number) {
    const game = this.game!,
      player = game.players[index];
    return html`<div
      class="table-cards"
      role="group"
      aria-label=${index === 0 ? "Your table cards" : "Computer table cards"}
    >
      ${shitheadSlots(player).map((slot, position) => {
        const top = player.faceUp.find((card) => cardId(card) === slot.faceUp);
        const down = player.faceDown.find((card) => cardId(card) === slot.faceDown);
        return html`<div class="table-slot" data-slot=${position}>
          ${
            down
              ? index === 0
                ? html`<button
                    class="card back lower-card"
                    style=${cardBackStyle(down, this.backAssignments)}
                    type="button"
                    data-concealed="true"
                    data-board-key=${this.motion.key(down)}
                    aria-label=${`Reveal face-down card ${position + 1}`}
                    ?disabled=${this.busy || game.phase !== "playing" || game.turn !== 0 || shitheadSource(player) !== "faceDown"}
                    @click=${() => {
                      void this.commit(playShithead(game, 0, [player.faceDown.indexOf(down)]));
                    }}
                  >
                    <span aria-hidden="true">✦</span>
                  </button>`
                : html`<div
                    class="card back lower-card"
                    style=${cardBackStyle(down, this.backAssignments)}
                    data-concealed="true"
                    data-board-key=${this.motion.key(down)}
                    aria-label="Computer face-down card"
                    role="img"
                  >
                    ✦
                  </div>`
              : nothing
          }
          ${top ? html`<div class="upper-card">${index === 0 ? this.cardButton(top, "faceUp") : html`<div class="card card-shell" data-board-key=${this.motion.key(top)} role="img" aria-label=${cardName(top)}>${this.face(top)}</div>`}</div>` : nothing}
        </div>`;
      })}
    </div>`;
  }
  private handControls() {
    return html`<div class="hand-controls">
      <div class="layout-switch" role="group" aria-label="Hand layout">
        ${(
          [
            ["fan", PlayingCards],
            ["grid", Grid3x3],
          ] as const
        ).map(
          ([layout, icon]) =>
            html`<button
              type="button"
              aria-label=${`${layout === "fan" ? "Fan" : "Grid"} layout`}
              aria-pressed=${this.handLayout === layout}
              @click=${() => {
                if (!this.busy)
                  void this.arrange(() => {
                    this.handLayout = layout;
                  });
              }}
            >
              ${unsafeHTML(buildLucideSvg(icon, { hasA11yProp: false }))}<span
                class="layout-tooltip"
                role="tooltip"
                >${layout === "fan" ? "Fan" : "Grid"} layout</span
              >
            </button>`,
        )}
      </div>
      <div class="layout-switch flip-switch" role="group" aria-label="Draw flip direction">
        ${flipOptions.map(
          (option, index) =>
            html`<button
              type="button"
              aria-label=${option.label}
              aria-pressed=${this.flipDirection === index}
              @click=${() => {
                this.flipDirection = index;
              }}
            >
              ${unsafeHTML(buildLucideSvg(option.icon, { hasA11yProp: false }))}<span
                class="layout-tooltip"
                role="tooltip"
                >${option.label}</span
              >
            </button>`,
        )}
      </div>
      <label
        >Sort<select
          aria-label="Sort"
          .value=${this.sortOrder}
          ?disabled=${this.busy}
          @change=${(event: Event) => {
            void this.arrange(() => {
              this.sortOrder = (event.target as HTMLSelectElement).value as SortOrder;
            });
          }}
        >
          <option value="draw-order">Draw order</option>
          <option value="manual">Manual order</option>
          <option value="rank-then-suit">Rank, then suit</option>
          <option value="suit-then-rank">Suit, then rank</option>
        </select></label
      >
    </div>`;
  }
  protected render() {
    const game = this.game;
    if (!game) return nothing;
    const player = game.players[0],
      opponent = game.players[1],
      setup = game.phase === "setup";
    const hand = handCards(this.handState(), this.sortOrder);
    const scale = parseFloat(getComputedStyle(document.documentElement).fontSize) / 16;
    const fan =
      this.handLayout === "fan" ? fanLayout(hand.length, this.handWidth, scale) : undefined;
    const yourTurn = game.phase === "playing" && game.turn === 0;
    const source = shitheadSource(player);
    const matchingSets =
      source === "faceDown"
        ? []
        : [...new Set(player[source].map((card) => card.rank))]
            .map((rank) => player[source].filter((card) => card.rank === rank))
            .filter((cards) => cards.length > 1 && canPlayShithead(cards[0], game.pile));
    return html`<section aria-label="Shithead against computer">
      ${this.saveFailed ? html`<p>Browser storage is unavailable. This game cannot be saved.</p>` : nothing}
      <header class="game-header">
        <h3>Shithead</h3>
        <button
          type="button"
          @click=${() => {
            this.changeTab("table");
            this.confirming = !this.confirming;
          }}
        >
          New game
        </button>
      </header>
      <div
        class="tabs"
        role="tablist"
        aria-label="Shithead views"
        @keydown=${(event: KeyboardEvent) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          this.changeTab(
            event.key === "Home"
              ? "table"
              : event.key === "End"
                ? "options"
                : this.tab === "table"
                  ? "options"
                  : "table",
          );
        }}
      >
        ${(["table", "options"] as const).map((tab) => html`<button role="tab" type="button" id=${`${tab}-tab`} aria-controls=${`${tab}-panel`} aria-selected=${this.tab === tab} tabindex=${this.tab === tab ? 0 : -1} @click=${() => this.changeTab(tab)}>${tab === "table" ? "Table" : "Options"}</button>`)}
      </div>
      <div
        id="options-panel"
        role="tabpanel"
        aria-labelledby="options-tab"
        ?hidden=${this.tab !== "options"}
      >
        ${this.options()}
      </div>
      <div
        id="table-panel"
        role="tabpanel"
        aria-labelledby="table-tab"
        ?hidden=${this.tab !== "table"}
      >
        ${
          this.confirming
            ? html`<div class="reset" role="group" aria-label="Confirm new Shithead game">
                <span>Replace this game?</span><button @click=${this.reset}>Deal new game</button
                ><button
                  @click=${() => {
                    this.confirming = false;
                  }}
                >
                  Keep playing
                </button>
              </div>`
            : nothing
        }
        <div class="board" aria-label="Card table">
          <div class="seat" data-active=${game.phase === "playing" && game.turn === 1}>
            <span class="turn-dot" aria-hidden="true"></span><strong>Computer</strong
            ><span class="count">${opponent.hand.length} cards</span>
          </div>
          <div
            class="opponent-hand"
            role="img"
            aria-label=${`Computer hand: ${opponent.hand.length} hidden cards`}
            style=${`--opponent-spread:${Math.min(180, Math.max(0, opponent.hand.length - 1) * 22)}px`}
          >
            ${opponent.hand.map((card, index) => html`<div class="card back" aria-hidden="true" data-concealed="true" data-board-key=${this.motion.key(card)} style=${`${cardBackStyle(card, this.backAssignments)}--opponent-x:${opponent.hand.length > 1 ? index / (opponent.hand.length - 1) : 0.5};--opponent-angle:${opponent.hand.length > 1 ? ((index / (opponent.hand.length - 1)) * 2 - 1) * 12 : 0}deg`}>✦</div>`)}
          </div>
          <div class="opponent-table">${this.tableCards(1)}</div>
          <div class="center-piles">
            <div class="board-pile">
              <div
                class="pile-base card back"
                style=${cardBackStyle(game.stock.at(-1), this.backAssignments)}
                data-board-zone="stock"
                data-concealed="true"
                aria-label=${`Stock: ${game.stock.length} cards`}
                role="img"
                data-empty=${!game.stock.length}
              >
                ${game.stock.length ? html`<span aria-hidden="true">✦</span>` : nothing}
              </div>
              <span>Stock <b>${game.stock.length}</b></span>
            </div>
            <div
              class="board-pile inspectable-pile"
              tabindex="0"
              role="group"
              aria-label="Play pile contents"
              aria-describedby=${this.previewPile === "pile" ? "pile-preview" : nothing}
              @pointerenter=${() => {
                this.openPilePreview("pile");
              }}
              @pointerleave=${this.closePilePreview}
              @focusin=${() => {
                this.openPilePreview("pile");
              }}
              @focusout=${this.closePilePreview}
              @keydown=${this.dismissPilePreview}
            >
              <button
                class="pile-base card card-shell pickup"
                type="button"
                data-board-zone="pile"
                aria-label="Pick up pile"
                ?disabled=${this.busy || !canPickupShithead(game, 0)}
                @click=${() => {
                  this.previewPile = null;
                  void this.commit(pickupShithead(game, 0));
                }}
              >
                ${game.pile.slice(-4).map((card, index, cards) => html`<span class="card card-shell pile-card" data-board-key=${this.motion.key(card)} style=${`--pile-angle:${(index - cards.length + 1) * 5}deg;--pile-offset:${(index - cards.length + 1) * 2}px`}>${this.face(card)}</span>`)}
                ${!game.pile.length ? html`<span class="pile-outline" aria-hidden="true"></span>` : nothing}</button
              ><span>Pile <b>${game.pile.length}</b></span>
              ${this.pilePreview("pile", game.pile)}
            </div>
            <div
              class="board-pile out-pile inspectable-pile"
              tabindex="0"
              role="group"
              aria-label="Exile pile contents"
              aria-describedby=${this.previewPile === "burned" ? "burned-preview" : nothing}
              @pointerenter=${() => {
                this.openPilePreview("burned");
              }}
              @pointerleave=${this.closePilePreview}
              @focusin=${() => {
                this.openPilePreview("burned");
              }}
              @focusout=${this.closePilePreview}
              @keydown=${this.dismissPilePreview}
            >
              <div
                class="pile-base card"
                data-board-zone="burned"
                role="img"
                aria-label=${`Burned: ${game.burned.length} cards`}
              >
                <span aria-hidden="true"
                  >${game.burned.length ? html`<span class="card back out-card" style=${cardBackStyle(game.burned.at(-2) ?? game.burned.at(-1), this.backAssignments)}></span><span class="card back out-card" style=${cardBackStyle(game.burned.at(-1), this.backAssignments)}></span>` : html`<span class="pile-outline"></span>`}</span
                >
              </div>
              <span>Out <b>${game.burned.length}</b></span>
              ${this.pilePreview("burned", game.burned)}
            </div>
          </div>
          <div class="your-table">${this.tableCards(0)}</div>
          <div class="seat your-seat" data-active=${yourTurn}>
            <span class="turn-dot" aria-hidden="true"></span><strong>You</strong
            ><span class="count"
              >${game.phase === "finished" ? (game.winner === 0 ? "Winner" : "Last player") : setup ? "Choose your table cards" : yourTurn ? "Your turn" : ""}</span
            >
          </div>
          ${game.phase === "finished" ? html`<div class="result"><strong>${game.winner === 0 ? "You’re out!" : "Computer is out"}</strong><span>${game.winner === 0 ? "Computer is the Shithead." : "You’re the Shithead this time."}</span><button @click=${this.reset}>Play again</button></div>` : nothing}
        </div>
        <div class="play-actions">
          ${
            yourTurn && !this.selecting
              ? matchingSets.map(
                  (cards) =>
                    html`<button
                      class="primary matching-set"
                      type="button"
                      ?disabled=${this.busy}
                      @click=${() => {
                        this.selecting = true;
                        this.selected = cards.map(cardId);
                      }}
                    >
                      Select all ${cards.length} × ${cards[0].rank}
                    </button>`,
                )
              : nothing
          }
          ${
            setup
              ? html`<button
                  class="primary"
                  ?disabled=${this.busy}
                  @click=${() => {
                    void this.commit(startShithead(game));
                  }}
                >
                  Start game
                </button>`
              : html`${this.selecting ? html`<button class="primary" type="button" ?disabled=${this.busy || !this.selected.length} @click=${this.playSelected}>Play selected${this.selected.length ? ` (${this.selected.length})` : ""}</button>` : nothing}<button
                    type="button"
                    aria-pressed=${this.selecting}
                    ?disabled=${this.busy || !yourTurn || shitheadSource(player) === "faceDown"}
                    @click=${() => {
                      this.selecting = !this.selecting;
                      this.selected = [];
                    }}
                  >
                    ${this.selecting ? "Cancel" : "Select matching cards"}
                  </button>`
          }
        </div>
        <div class="hand-heading">
          <h3>Your hand <span>(${player.hand.length})</span></h3>
          ${this.handControls()}
        </div>
        <div class="hand-region">
          <div class="hand-content">
            <ul
              class="hand"
              data-layout=${this.handLayout}
              style=${fan ? `height:${fan.height}px` : ""}
              aria-label="Your hand"
              @pointerdown=${(event: PointerEvent) => {
                if (!this.busy) {
                  this.motion.finish();
                  this.handDrag.pointerDown(event);
                }
              }}
              @pointermove=${this.handDrag.pointerMove}
              @pointerup=${this.handDrag.pointerUp}
              @pointercancel=${this.handDrag.pointerCancel}
              @lostpointercapture=${this.handDrag.pointerCancel}
              @keydown=${this.reorderKey}
            >
              ${repeat(hand, cardId, (card, index) => html`<li style=${fan ? `--fan-x:${fan.slots[index].x}px;--fan-y:${fan.slots[index].y}px;--fan-order:${index}` : ""}>${this.cardButton(card, "hand", fan?.slots[index].angle ?? 0)}</li>`)}
            </ul>
          </div>
        </div>
        <p class="sr-only" role="status" aria-live="polite" aria-atomic="true">${game.message}</p>
        <details>
          <summary>How to play</summary>
          <p>
            Click a single card to play it. Clicking a card with matches selects it so you can add
            more. Press Play selected to play them together, or Cancel to keep your cards. Select
            all chooses a matching set without playing it. Drag to arrange your hand, or use Alt +
            Left/Right and Alt + Home/End. Choose Select matching cards, or Shift-click, to play a
            matching set. During setup, choose a hand card and then a table card to swap. Click the
            pile to pick it up.
          </p>
          <p>
            Play equal or higher ranks; aces are high. A 2 resets the rank, a 10 burns the pile, and
            four equal ranks on top also burn it. After a burn, play again. Draws refill your hand
            automatically. Clear your hand, then your face-up cards, then play blind cards. A failed
            blind play picks up the pile. The last player with cards loses.
          </p>
          <p>
            ${game.rules.voluntaryPickup ? "Voluntary pickup is allowed." : "You must play if able; blind cards must be attempted."}
            ${game.rules.playAgainAfterTwo ? "A 2 gives another turn." : "A 2 ends your turn."}
            ${game.rules.revealUncovered ? "Uncovered lower cards turn face up and become playable." : "Lower cards stay hidden until the blind endgame."}
          </p>
          <p>
            Your game and options are saved in this browser, including when you reload or switch
            modes.
          </p>
        </details>
      </div>
    </section>`;
  }
  static styles = [
    cardTableStyles,
    css`
      :host {
        display: block;
        min-width: 0;
      }
      [hidden] {
        display: none !important;
      }
      h3,
      p {
        margin: 0;
      }
      p {
        line-height: 1.6;
      }
      .muted,
      .count {
        color: var(--color-muted, #506050);
      }
      .game-header,
      .tabs,
      .seat,
      .play-actions {
        display: flex;
        align-items: center;
        gap: 0.65rem;
        flex-wrap: wrap;
      }
      .game-header {
        justify-content: space-between;
      }
      .game-header h3 {
        font-size: 1.1rem;
      }
      .tabs {
        margin: 1rem 0;
        border-bottom: 1px solid var(--color-border, #d0d8d0);
        padding-bottom: 0.7rem;
      }
      [role="tab"][aria-selected="true"] {
        background: var(--color-hover, #e9efe7);
        border-color: var(--color-text, #202820);
      }
      .board {
        position: relative;
        display: grid;
        justify-items: center;
        gap: 0.7rem;
        padding: 1rem 0.4rem 0.6rem;
        border: 1px solid var(--color-border, #d0d8d0);
        border-radius: 1.4rem;
        background:
          radial-gradient(ellipse at center, transparent 30%, #00000006),
          var(--color-hover, #e9efe7);
      }
      .seat {
        font-size: 0.85rem;
        min-height: 1.6rem;
      }
      .turn-dot {
        width: 0.5rem;
        height: 0.5rem;
        border-radius: 50%;
        border: 1px solid var(--color-border-strong, #859585);
      }
      .seat[data-active="true"] .turn-dot {
        background: var(--color-primary, #386541);
        border-color: var(--color-primary, #386541);
        box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-primary, #386541) 15%, transparent);
      }
      .seat[data-active="true"] strong {
        text-decoration: underline;
        text-underline-offset: 5px;
      }
      .opponent-hand {
        height: 76px;
        position: relative;
        width: calc(var(--opponent-spread) + 48px);
      }
      .opponent-hand > .card {
        position: absolute;
        width: 48px;
        height: 68px;
        left: calc(var(--opponent-x) * var(--opponent-spread));
        top: 2px;
        transform: rotate(var(--opponent-angle));
        box-shadow: 0 2px 4px #0002;
      }
      .table-cards {
        display: flex;
        justify-content: center;
        gap: 1rem;
      }
      .table-slot {
        position: relative;
        width: 4.5rem;
        height: 7.4rem;
        border-radius: 0.5rem;
      }
      .table-slot:empty {
        outline: 1px dashed var(--color-border, #d0d8d0);
        outline-offset: -4px;
      }
      .lower-card {
        position: absolute;
        top: 0.9rem;
        left: 0;
      }
      .upper-card {
        position: absolute;
        top: 0;
        left: 0;
      }
      .upper-card .card {
        box-shadow: 0 2px 5px #0002;
      }
      .lower-card:disabled {
        opacity: 1;
        font-size: 1.75rem;
      }
      .center-piles {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: clamp(0.8rem, 4vw, 2.6rem);
        width: 100%;
        padding: 1rem 0;
      }
      .board-pile {
        display: grid;
        justify-items: center;
        gap: 0.6rem;
        font-size: 0.75rem;
        color: var(--color-muted, #506050);
      }
      .board-pile b {
        color: var(--color-text, #202820);
        font-variant-numeric: tabular-nums;
        margin-left: 0.2rem;
      }
      .inspectable-pile:focus-visible {
        outline: 2px solid var(--color-primary, #386541);
        outline-offset: 7px;
        border-radius: 0.5rem;
      }
      .pile-preview {
        position: absolute;
        top: calc(100% - 1rem);
        left: 50%;
        transform: translateX(-50%);
        z-index: 10;
        box-sizing: border-box;
        width: min(100%, 25rem);
        max-height: min(20rem, 50vh);
        overflow: auto;
        overscroll-behavior: contain;
        padding: 1rem;
        border: 1px solid var(--color-border-strong, #859585);
        border-radius: 0.75rem;
        background: var(--color-surface, #f7f9f5);
        color: var(--color-text, #202820);
        box-shadow: 0 0.5rem 1.5rem #0003;
      }
      .preview-order {
        display: block;
        margin-top: 0.25rem;
        color: var(--color-muted, #506050);
      }
      .preview-cards {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(2.5rem, 1fr));
        gap: 0.4rem;
        list-style: none;
        padding: 0;
        margin: 0.75rem 0 0;
      }
      .preview-card {
        position: relative;
        padding: 0.4rem 0.25rem;
        border: 1px solid #b6b9ad;
        border-radius: 0.3rem;
        background: #fffef8;
        color: #202820;
        text-align: center;
        font-size: 1rem;
        font-weight: 600;
      }
      .preview-card span span {
        display: block;
        font-size: 1.25rem;
      }
      .preview-card[data-suit="Hearts"],
      .preview-card[data-suit="Diamonds"] {
        color: #b82132;
      }
      .pile-base {
        position: relative;
        display: grid;
        place-items: center;
      }
      .pile-base.back {
        box-shadow:
          3px 3px 0 #d8e4d8,
          4px 4px 0 #778273,
          6px 6px 0 #d8e4d8,
          7px 7px 0 #778273;
      }
      .pile-base[data-empty="true"] {
        background: none;
        box-shadow: none;
        border: 1px dashed var(--color-border-strong, #859585);
      }
      .pickup {
        cursor: pointer;
      }
      .pickup:disabled {
        opacity: 1;
        cursor: default;
      }
      .pickup:enabled {
        outline: 2px solid var(--color-primary, #386541);
        outline-offset: 5px;
      }
      .pile-card {
        position: absolute;
        left: var(--pile-offset);
        top: var(--pile-offset);
        transform: rotate(var(--pile-angle));
        pointer-events: none;
        box-shadow: 0 2px 5px #0002;
      }
      .pile-outline {
        display: block;
        position: absolute;
        inset: 0;
        border: 1px dashed var(--color-border-strong, #859585);
        border-radius: 0.5rem;
      }
      .out-pile .pile-base {
        border: 0;
        background: none;
      }
      .out-card {
        position: absolute;
        inset: 0;
        opacity: 0.45;
        transform: rotate(7deg);
      }
      .out-card + .out-card {
        transform: rotate(-6deg);
      }
      .play-actions {
        justify-content: center;
        min-height: 3.8rem;
        padding: 0.5rem 0;
      }
      .hand-heading {
        margin-top: 0.7rem;
        gap: 0.75rem;
      }
      .hand-region {
        margin: 0.7rem 0;
      }
      .card[aria-pressed="true"] {
        outline: 3px solid var(--color-primary, #386541);
        outline-offset: 3px;
      }
      .card[aria-disabled="true"] {
        cursor: grab;
      }
      .upper-card .card[aria-disabled="true"] {
        cursor: default;
      }
      .card[data-playable="true"] .flight-front {
        border-color: var(--color-primary, #386541);
      }
      [data-board-arriving] {
        visibility: hidden !important;
      }
      .board-flight {
        box-shadow: none;
      }
      .board-flight .flight-front,
      .board-flight .flight-back {
        box-shadow: 0 0.5rem 1.2rem #0003;
      }
      .result {
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        width: min(90%, 22rem);
        padding: 1.5rem;
        display: grid;
        justify-items: center;
        gap: 0.7rem;
        border: 1px solid var(--color-border-strong, #859585);
        border-radius: 1rem;
        background: var(--color-surface, #f7f9f5);
        box-shadow: 0 0.8rem 2rem #0002;
        text-align: center;
        z-index: 5;
      }
      .result strong {
        font-size: 1.4rem;
      }
      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
        border: 0;
      }
      details {
        border-top: 1px solid var(--color-border, #d0d8d0);
        padding-top: 1rem;
        margin-top: 1rem;
      }
      details p {
        margin-top: 0.8rem;
      }
      .rule-options {
        display: grid;
        gap: 1.2rem;
        margin: 1.5rem 0;
      }
      .rule-option {
        display: flex;
        align-items: flex-start;
        flex-wrap: nowrap;
        gap: 0.75rem;
        cursor: pointer;
        line-height: 1.5;
        font-size: 1rem;
      }
      .rule-option input {
        width: 1.25rem;
        height: 1.25rem;
        flex: 0 0 auto;
        margin: 0.2rem 0 0;
        accent-color: var(--color-primary, #386541);
      }
      .rule-help {
        display: block;
        color: var(--color-muted, #506050);
        margin-top: 0.25rem;
      }
      #options-panel > button {
        margin-top: 1rem;
      }
      @media (max-width: 420px) {
        .table-cards {
          gap: 0.7rem;
        }
        .board {
          border-radius: 0.8rem;
        }
        .hand-controls {
          gap: 0.5rem;
        }
        .hand-controls select {
          max-width: 10rem;
        }
        .game-header h3 span {
          display: none;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        *,
        *::before,
        *::after {
          transition: none !important;
          animation: none !important;
        }
      }
    `,
  ];
}
if (!customElements.get("shithead-game")) customElements.define("shithead-game", ShitheadGame);

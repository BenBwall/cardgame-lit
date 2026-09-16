import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { OnlineClient } from "@cardgame/multiplayer/client.js";
import type { RoomView } from "@cardgame/multiplayer/protocol.js";

export interface LobbyGame {
  id: string;
  title: string;
  defaults: () => unknown;
  options: (value: unknown, change: (value: unknown) => void) => TemplateResult;
  board: (room: RoomView, send: (action: unknown) => void, disabled: boolean) => TemplateResult;
}

/** Reusable room UI. A game contributes controls; no game rules live here. */
export class OnlineLobby extends LitElement {
  static properties = {
    serverUrl: { attribute: "server-url" },
    games: { attribute: false },
    selected: { state: true },
    options: { state: true },
    error: { state: true },
    copied: { state: true },
  } as const;
  serverUrl = "";
  games: readonly LobbyGame[] = [];
  private selected = "";
  private options: unknown;
  private error = "";
  private copied = false;
  private username = "";
  private code = "";
  private client?: OnlineClient;

  disconnectedCallback() {
    this.client?.dispose();
    this.client = undefined;
    super.disconnectedCallback();
  }
  private async enter(join: boolean) {
    this.error = "";
    this.copied = false;
    if (!this.username.trim()) {
      this.error = "Enter a display username.";
      return;
    }
    if (join && !/^[a-z2-9]{6}$/i.test(this.code.trim())) {
      this.error = "Enter the six-character room code.";
      return;
    }
    const game = this.games.find((g) => g.id === this.selected) ?? this.games[0];
    if (!game) {
      this.error = "No online games are configured.";
      return;
    }
    try {
      this.client?.dispose();
      this.client = new OnlineClient(this.serverUrl, () => this.requestUpdate());
      await this.client.enter(
        this.username,
        game.id,
        this.options ?? game.defaults(),
        join ? this.code : undefined,
      );
    } catch (error) {
      this.error = error instanceof Error ? error.message : "Could not connect.";
    }
    this.requestUpdate();
  }
  private async copyCode() {
    try {
      await navigator.clipboard.writeText(this.client!.room!.code);
      this.copied = true;
    } catch {
      this.error = "Copy was unavailable. Select the room code and copy it manually.";
    }
  }
  protected render() {
    const client = this.client,
      room = client?.room;
    const selected = room
      ? this.games.find((g) => g.id === room.gameId)
      : (this.games.find((g) => g.id === this.selected) ?? this.games[0]);
    const disabled = client?.status !== "connected" || !!client?.pending;
    const busy = client?.status === "connecting" || client?.status === "reconnecting";
    return html`<section aria-label="Online multiplayer">
      <h3>Play online</h3>
      <p class="help">
        Display names are not accounts and may be shared by other players. Keep this tab open:
        reloading ends your anonymous session.
      </p>
      ${!this.serverUrl ? html`<p role="status">Online play is not configured on this site yet. Free play and the computer game are available.</p>` : nothing}
      <p role="status" aria-live="polite">
        Connection: ${client?.status ?? "idle"}${client?.pending ? " · Sending move…" : ""}
      </p>
      ${this.error || client?.error ? html`<p role="alert">${this.error || client?.error}</p>` : nothing}
      ${room && !selected ? html`<p role="alert">This game is not supported by this page. Leave the room and reload to update the available games.</p>` : nothing}
      ${
        room
          ? html`
              <div class="row">
                <strong>Room <span class="code">${room.code}</span></strong>
                <button @click=${this.copyCode}>Copy room code</button>
                <button @click=${() => void client!.leave()}>Leave room</button>
              </div>
              ${this.copied ? html`<p role="status">Room code copied.</p>` : nothing}
              <h4>${selected?.title ?? room.gameId} · Round ${room.round || 1}</h4>
              <ul aria-label="Players">
                ${room.players.map(
                  (p, index) => html`<li>
                    Seat ${index + 1}:
                    ${p.username}${p.id === room.self ? " (you)" : ""}${p.id === room.creator ? " · creator" : ""}
                    ·
                    ${p.connected ? "connected" : "reconnecting"}${p.rematch ? " · wants a rematch" : ""}
                  </li>`,
                )}
              </ul>
              ${
                room.phase === "waiting"
                  ? html`<p>
                        Share this code with your opponent. The creator starts when everyone is
                        connected.
                      </p>
                      <fieldset disabled>
                        <legend>Room options</legend>
                        ${selected?.options(room.options, () => {})}
                      </fieldset>
                      ${room.self === room.creator ? html`<button ?disabled=${disabled} @click=${() => client!.send("start")}>Start game</button>` : nothing} `
                  : selected?.board(room, (action) => client!.send("action", action), disabled)
              }
              ${
                room.phase === "finished"
                  ? html`<button
                        ?disabled=${disabled || room.players.find((p) => p.id === room.self)?.rematch}
                        @click=${() => client!.send("rematch")}
                      >
                        Request rematch
                      </button>
                      <p>All players must agree to a rematch. Room rules stay the same.</p>`
                  : nothing
              }
            `
          : html`
              ${busy ? html`<button @click=${() => void client!.leave()}>Leave room</button>` : nothing}
              <fieldset ?disabled=${busy || !this.serverUrl}>
                <legend>Enter a room</legend>
                <label
                  >Display username
                  <input
                    autocomplete="off"
                    maxlength="32"
                    .value=${this.username}
                    @input=${(e: Event) => {
                      this.username = (e.target as HTMLInputElement).value;
                    }}
                /></label>
                <label
                  >Online game
                  <select
                    .value=${selected?.id ?? ""}
                    @change=${(e: Event) => {
                      this.selected = (e.target as HTMLSelectElement).value;
                      this.options = this.games.find((g) => g.id === this.selected)?.defaults();
                    }}
                  >
                    ${this.games.map((g) => html`<option value=${g.id}>${g.title}</option>`)}
                  </select></label
                >
                <fieldset>
                  <legend>New room rules</legend>
                  ${selected?.options(this.options ?? selected.defaults(), (v) => {
                    this.options = v;
                  })}
                </fieldset>
                <button @click=${() => void this.enter(false)}>Create room</button>
                <label
                  >Room code
                  <input
                    maxlength="6"
                    autocapitalize="characters"
                    autocomplete="off"
                    spellcheck="false"
                    .value=${this.code}
                    @input=${(e: Event) => {
                      this.code = (e.target as HTMLInputElement).value;
                    }}
                /></label>
                <button @click=${() => void this.enter(true)}>Join room</button>
              </fieldset>
            `
      }
    </section>`;
  }
  static styles = css`
    :host {
      display: block;
      color: inherit;
      font: inherit;
    }
    :host([hidden]) {
      display: none;
    }
    section {
      padding: 1rem 0;
    }
    h3,
    h4 {
      margin: 0.6rem 0;
    }
    p {
      line-height: 1.5;
    }
    .help {
      opacity: 0.8;
      max-width: 65ch;
    }
    fieldset {
      border: 1px solid currentColor;
      border-radius: 0.5rem;
      padding: 1rem;
      margin: 1rem 0;
      min-width: 0;
    }
    label {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.6rem;
      margin: 0.8rem 0;
    }
    input,
    select,
    button {
      font: inherit;
      color: inherit;
      background: var(--color-surface, transparent);
      border: 1px solid currentColor;
      border-radius: 0.35rem;
      padding: 0.55rem 0.75rem;
      max-width: 100%;
      box-sizing: border-box;
    }
    input[type="checkbox"] {
      width: 1.1rem;
      height: 1.1rem;
    }
    button {
      cursor: pointer;
      margin: 0.25rem;
      min-height: 44px;
    }
    button:disabled {
      opacity: 0.5;
      cursor: default;
    }
    button:focus-visible,
    input:focus-visible,
    select:focus-visible {
      outline: 3px solid currentColor;
      outline-offset: 3px;
    }
    .row,
    .cards {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem;
    }
    .code {
      font: bold 1.3rem monospace;
      letter-spacing: 0.15em;
      user-select: all;
    }
    [role="alert"] {
      border-inline-start: 3px solid currentColor;
      padding: 0.6rem;
      font-weight: 600;
    }
    .card {
      min-width: 5rem;
      min-height: 5rem;
    }
  `;
}
if (!customElements.get("online-lobby")) customElements.define("online-lobby", OnlineLobby);

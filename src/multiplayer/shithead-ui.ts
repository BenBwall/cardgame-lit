import { html } from "lit";
import { cardName } from "@cardgame/cards.js";
import { DEFAULT_SHITHEAD_RULES, type ShitheadRules } from "@cardgame/shithead-state.js";
import type { LobbyGame } from "@cardgame/multiplayer/online-lobby.js";
import type { OnlineShitheadView } from "@cardgame/multiplayer/shithead-view.js";

const rules = [
  ["voluntaryPickup", "Allow voluntary pile pickup"],
  ["playAgainAfterTwo", "Play again after a 2"],
  ["revealUncovered", "Reveal uncovered face-down cards"],
] as const satisfies readonly (readonly [keyof ShitheadRules, string])[];
export const onlineGames = [
  {
    id: "shithead",
    title: "Shithead · 2 players",
    defaults: () => ({ ...DEFAULT_SHITHEAD_RULES }),
    options(value, change) {
      const options = value as ShitheadRules;
      return html`${rules.map(
        ([key, label]) => html`<label
          ><input
            type="checkbox"
            .checked=${options[key]}
            @change=${(e: Event) => change({ ...options, [key]: (e.target as HTMLInputElement).checked })}
          />${label}</label
        >`,
      )}`;
    },
    board(room, send, disabled) {
      const state = room.state as OnlineShitheadView;
      const self = state.players[state.actor];
      const setup = state.phase === "setup",
        active = state.phase === "playing" && state.turn === state.actor;
      const playerName = (seat: number) => `Seat ${seat + 1}: ${room.players[seat].username}`;
      const available =
        state.source === "hand" ? self.hand! : state.source === "faceUp" ? self.faceUp : [];
      return html`<div
        aria-label="Online Shithead board"
        data-phase=${state.phase}
        data-turn=${state.turn}
      >
        <p role="status">
          ${
            state.phase === "finished"
              ? `${playerName(state.winner!)} won.`
              : setup
                ? "Choose setup swaps, then mark yourself ready. Both players must be ready."
                : `${playerName(state.turn)} to play.${active ? " Your turn." : ""}`
          }
        </p>
        <p>
          Stock: ${state.stockCount} · Burned: ${state.burnedCount} · Pile: ${state.pile.length}
        </p>
        <p>Top card: ${state.pile.length ? cardName(state.pile.at(-1)!) : "Empty pile"}</p>
        <details>
          <summary>View pile</summary>
          <p>${state.pile.map(cardName).join(", ") || "Empty pile"}</p>
        </details>
        ${state.players.map(
          (p, seat) => html`<section aria-label=${`Seat ${seat + 1} cards`}>
            <h4>${playerName(seat)}${seat === state.actor ? " (you)" : ""}</h4>
            <p>Hand: ${p.handCount} cards · Face down: ${p.faceDownCount} cards</p>
            <p>Face up: ${p.faceUp.map(cardName).join(", ") || "None"}</p>
            ${seat === state.actor ? html`<p>Your hand: ${p.hand!.map(cardName).join(", ") || "Empty"}</p>` : ""}
          </section>`,
        )}
        ${
          setup
            ? html`<fieldset ?disabled=${disabled || state.ready[state.actor]}>
                  <legend>Setup swaps</legend>
                  <label
                    >Hand card
                    <select id="swap-hand">
                      ${self.hand!.map((c, i) => html`<option value=${i}>${cardName(c)}</option>`)}
                    </select></label
                  >
                  <label
                    >Face-up card
                    <select id="swap-up">
                      ${self.faceUp.map((c, i) => html`<option value=${i}>${cardName(c)}</option>`)}
                    </select></label
                  >
                  <button
                    @click=${(e: Event) => {
                      const root = (e.target as HTMLElement).getRootNode() as ShadowRoot;
                      send({
                        kind: "swap",
                        hand: Number((root.getElementById("swap-hand") as HTMLSelectElement).value),
                        faceUp: Number((root.getElementById("swap-up") as HTMLSelectElement).value),
                      });
                    }}
                  >
                    Swap cards</button
                  ><button @click=${() => send({ kind: "ready" })}>Ready to play</button>
                </fieldset>
                <p>${state.ready.filter(Boolean).length} of 2 players ready</p>`
            : html` <fieldset ?disabled=${disabled || !active}>
                <legend>
                  Your
                  ${state.source === "faceDown" ? "blind cards" : state.source === "faceUp" ? "face-up cards" : "hand"}
                </legend>
                <div class="cards">
                  ${
                    state.source === "faceDown"
                      ? Array.from(
                          { length: self.faceDownCount },
                          (_, i) =>
                            html`<button
                              class="card"
                              @click=${() => send({ kind: "play", indices: [i] })}
                            >
                              Play blind card ${i + 1}
                            </button>`,
                        )
                      : available.map(
                          (c, i) =>
                            html`<button
                              class="card"
                              @click=${() => send({ kind: "play", indices: [i] })}
                            >
                              Play ${cardName(c)}
                            </button>`,
                        )
                  }
                </div>
                ${
                  state.source !== "faceDown"
                    ? html`<form
                        @submit=${(e: SubmitEvent) => {
                          e.preventDefault();
                          const data = new FormData(e.target as HTMLFormElement);
                          send({ kind: "play", indices: data.getAll("card").map(Number) });
                          (e.target as HTMLFormElement).reset();
                        }}
                      >
                        <p>To play a matching set, select cards of the same rank:</p>
                        ${available.map((c, i) => html`<label><input type="checkbox" name="card" value=${i} />${cardName(c)}</label>`)}
                        <button type="submit">Play selected</button>
                      </form>`
                    : ""
                }
                <button ?disabled=${!state.canPickup} @click=${() => send({ kind: "pickup" })}>
                  Pick up pile
                </button>
              </fieldset>`
        }
      </div>`;
    },
  },
] as const satisfies readonly LobbyGame[];

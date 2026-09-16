import { LitElement, css, html, nothing } from "lit";
import { live } from "lit/directives/live.js";
import { cardTableStyles } from "@cardgame/card-table-styles.js";
import {
  type CardArtwork,
  defaultArtwork,
  isFaceStyle,
  isBackStyle,
  isBasicBackPattern,
  isCardId,
  faceChoices,
  backChoices,
  faceImage,
  backImage,
  importCardImage,
  cardIdFromFilename,
  isArtwork,
  faceContents,
  basicBackBackground,
  basicBackInk,
  basicBackStripeColor,
  basicBackPatterns,
  defaultBasicBackColor,
} from "@cardgame/card-art.js";
import { colorFromHex, colorToHex } from "@cardgame/card-colors.js";
import { createDeck, cardId, cardName, type CardId } from "@cardgame/cards.js";

type UploadKind = "back" | "face" | "deck";
type ArtworkDraft = { -readonly [Key in keyof CardArtwork]: CardArtwork[Key] } & {
  customFaces: Partial<Record<CardId, string>>;
};

export class CardAppearance extends LitElement {
  static properties = {
    value: { attribute: false },
    saveError: { attribute: false },
    uploading: { state: true },
    message: { state: true },
    targetCard: { state: true },
    expanded: { state: true },
  } as const;
  value: CardArtwork = defaultArtwork();
  saveError = "";
  private uploading = false;
  private message = "";
  private targetCard: CardId = "A-Spades";
  private expanded = false;
  private choose(value: CardArtwork): void {
    this.message = "";
    this.dispatchEvent(
      new CustomEvent("artwork-change", { detail: value, bubbles: true, composed: true }),
    );
  }
  private async upload(event: Event, kind: UploadKind): Promise<void> {
    const input = event.target as HTMLInputElement,
      files = [...(input.files ?? [])];
    if (!files.length || this.uploading) return;
    this.uploading = true;
    this.message = "";
    const target = this.targetCard;
    try {
      if (files.length > 52) throw new Error("Choose at most 52 card images at once.");
      const next: ArtworkDraft = { ...this.value, customFaces: { ...this.value.customFaces } };
      const seen = new Set<string>();
      for (const file of files) {
        const id = kind === "deck" ? cardIdFromFilename(file.name) : target;
        if (!id)
          throw new Error(
            `Name card files like A-Spades.png or 10-Hearts.jpg. Could not match ${file.name}.`,
          );
        if (seen.has(id)) throw new Error(`More than one image was supplied for ${id}.`);
        seen.add(id);
        const image = await importCardImage(file);
        if (kind === "back") {
          next.customBack = image;
          next.back = "custom";
        } else {
          next.customFaces[id] = image;
          next.faces = "custom";
        }
      }
      if (!isArtwork(next))
        throw new Error("Your custom art is too large to save. Remove some custom faces first.");
      this.choose(next);
    } catch (error) {
      this.message = error instanceof Error ? error.message : "Could not import these images.";
    } finally {
      input.value = "";
      this.uploading = false;
    }
  }
  protected render() {
    const example = createDeck().find((c) => cardId(c) === this.targetCard)!;
    const front = faceImage(this.value, example),
      back = backImage(this.value);
    return html`<button
        class="appearance-tab"
        type="button"
        popovertarget="appearance-panel"
        aria-controls="appearance-panel"
        aria-expanded=${this.expanded}
      >
        Card appearance
      </button>
      <section
        id="appearance-panel"
        class="appearance"
        popover="auto"
        aria-label="Card appearance settings"
        @beforetoggle=${(event: Event) => {
          const panel = event.target as HTMLElement;
          if (
            panel.matches(":popover-open") &&
            panel.contains(this.shadowRoot?.activeElement ?? null)
          ) {
            // Restore focus across the shadow boundary when a focused panel closes.
            queueMicrotask(() =>
              this.renderRoot
                .querySelector<HTMLButtonElement>(".appearance-tab")
                ?.focus({ preventScroll: true }),
            );
          }
        }}
        @toggle=${(event: Event) => {
          this.expanded = (event.target as HTMLElement).matches(":popover-open");
        }}
      >
        <header class="appearance-heading">
          <h2>Card appearance</h2>
          <button
            type="button"
            popovertarget="appearance-panel"
            popovertargetaction="hide"
            autofocus
            aria-label="Close card appearance"
          >
            ✕
          </button>
        </header>
        <div class="appearance-content">
          <p>
            Choose faces and backs independently. Applies to both games and saves in this browser.
          </p>
          <fieldset ?disabled=${this.uploading}>
            <legend>Built-in styles</legend>
            <label
              >Card faces<select
                aria-label="Card faces"
                .value=${live(this.value.faces)}
                @change=${(e: Event) => {
                  const value = (e.target as HTMLSelectElement).value;
                  if (isFaceStyle(value)) this.choose({ ...this.value, faces: value });
                }}
              >
                ${faceChoices.map((c) => html`<option value=${c.id} ?selected=${this.value.faces === c.id}>${c.label}</option>`)}
              </select></label
            >
            <label
              >Card back<select
                aria-label="Card back"
                .value=${live(this.value.back)}
                @change=${(e: Event) => {
                  const value = (e.target as HTMLSelectElement).value;
                  if (isBackStyle(value)) this.choose({ ...this.value, back: value });
                }}
              >
                ${backChoices.map((c) => html`<option value=${c.id} ?selected=${this.value.back === c.id} ?disabled=${c.id === "custom" && !this.value.customBack}>${c.label}</option>`)}
              </select></label
            >
            ${
              this.value.back === "basic"
                ? html` <label
                      >Basic back color
                      <input
                        type="color"
                        .value=${live(colorToHex(this.value.basicBackColor ?? defaultBasicBackColor))}
                        @input=${(event: Event) => this.choose({ ...this.value, basicBackColor: colorFromHex((event.target as HTMLInputElement).value) })}
                      />
                    </label>
                    <label
                      >Basic back pattern
                      <select
                        .value=${live(this.value.basicBackPattern ?? "diagonal")}
                        @change=${(event: Event) => {
                          const pattern = (event.target as HTMLSelectElement).value;
                          if (isBasicBackPattern(pattern))
                            this.choose({ ...this.value, basicBackPattern: pattern });
                        }}
                      >
                        ${basicBackPatterns.map((pattern) => html`<option value=${pattern} ?selected=${(this.value.basicBackPattern ?? "diagonal") === pattern}>${pattern === "plain" ? "Plain (no stripes)" : `${pattern[0].toUpperCase()}${pattern.slice(1)} stripes`}</option>`)}
                      </select>
                    </label>
                    ${
                      this.value.basicBackPattern !== "plain"
                        ? html`
                            <label
                              >Basic back secondary color
                              <input
                                type="color"
                                aria-describedby="secondary-color-help"
                                .value=${live(colorToHex(basicBackStripeColor(this.value)))}
                                @input=${(event: Event) => this.choose({ ...this.value, basicBackSecondaryColor: colorFromHex((event.target as HTMLInputElement).value) })}
                              />
                            </label>
                            <p id="secondary-color-help">
                              ${this.value.basicBackSecondaryColor ? "Custom stripe color." : "Automatic: follows the main color with a lighter shade."}
                            </p>
                            <button
                              type="button"
                              ?disabled=${!this.value.basicBackSecondaryColor}
                              @click=${() => this.choose({ ...this.value, basicBackSecondaryColor: undefined })}
                            >
                              Use automatic stripe color
                            </button>
                          `
                        : nothing
                    }`
                : nothing
            }
            <div class="art-samples" aria-label="Artwork preview">
              <div
                class="art-sample face"
                data-suit=${example.suit}
                role="img"
                aria-label=${`Face preview: ${cardName(example)}`}
              >
                ${front ? html`<img class=${this.value.faces === "kenney" ? "kenney-art" : ""} src=${front} alt="" />` : faceContents(example, this.value)}
              </div>
              <div
                class="art-sample basic-back"
                role="img"
                aria-label="Back preview"
                style=${back ? "" : `background-image:${basicBackBackground(this.value)};color:${basicBackInk(this.value)}`}
              >
                ${back ? html`<img class=${this.value.back === "kenney" ? "kenney-art" : ""} src=${back} alt="" />` : html`<span>✦</span>`}
              </div>
            </div>
            ${this.value.back === "wildlife" ? html`<p>Each card gets a random GreyWyvern back for this game. Its back stays the same through moves and refreshes; a new deal assigns new backs.</p>` : nothing}
          </fieldset>
          <fieldset ?disabled=${this.uploading}>
            <legend>Your images</legend>
            <p>
              PNG, JPEG, or WebP, up to 5 MB each. Images fit the card without cropping and stay on
              this device.
            </p>
            <label
              >Upload a back<input
                aria-label="Upload a back"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                @change=${(e: Event) => {
                  void this.upload(e, "back");
                }}
            /></label>
            <label
              >Card to customize<select
                aria-label="Card to customize"
                .value=${this.targetCard}
                @change=${(e: Event) => {
                  const id = (e.target as HTMLSelectElement).value;
                  if (isCardId(id)) this.targetCard = id;
                }}
              >
                ${createDeck().map((c) => html`<option value=${cardId(c)} ?selected=${this.targetCard === cardId(c)}>${cardName(c)}</option>`)}
              </select></label
            >
            <label
              >Upload this card’s face<input
                aria-label="Upload card face"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                @change=${(e: Event) => {
                  void this.upload(e, "face");
                }}
            /></label>
            <label
              >Import several faces<input
                aria-label="Import card faces"
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp"
                @change=${(e: Event) => {
                  void this.upload(e, "deck");
                }}
            /></label>
            <p>
              Name files like <code>A-Spades.png</code>, <code>10-Hearts.jpg</code>, or
              <code>K-Clubs.webp</code>. Cards without custom art use the basic face.
            </p>
            <p>${Object.keys(this.value.customFaces).length} of 52 custom faces</p>
            <div class="clear-actions">
              <button
                type="button"
                ?disabled=${!this.value.customFaces[this.targetCard]}
                @click=${() => {
                  const customFaces = { ...this.value.customFaces };
                  delete customFaces[this.targetCard];
                  this.choose({ ...this.value, customFaces });
                }}
              >
                Remove this face
              </button>
              <button
                type="button"
                ?disabled=${!Object.keys(this.value.customFaces).length}
                @click=${() => this.choose({ ...this.value, faces: "basic", customFaces: {} })}
              >
                Clear custom faces
              </button>
              <button
                type="button"
                ?disabled=${!this.value.customBack}
                @click=${() => this.choose({ ...this.value, back: "basic", customBack: "" })}
              >
                Remove custom back
              </button>
            </div>
          </fieldset>
          ${this.uploading ? html`<p role="status">Importing images…</p>` : nothing}
          ${this.message || this.saveError ? html`<p role="alert">${this.message || this.saveError}</p>` : nothing}
          <p class="credits">
            Free CC0 artwork:
            <a
              href="https://kenney.nl/assets/playing-cards-pack"
              target="_blank"
              rel="noopener noreferrer"
              >Kenney</a
            >
            and
            <a
              href="https://opengameart.org/content/greywyvern-playing-card-set"
              target="_blank"
              rel="noopener noreferrer"
              >Brian Huisman / GreyWyvern</a
            >. Basic (HTML+CSS) styles remain available.
          </p>
        </div>
      </section>`;
  }
  static styles = [
    cardTableStyles,
    css`
      :host {
        display: block;
      }
      .appearance-tab {
        position: fixed;
        inset: 50% auto auto 0;
        transform: translateY(-50%);
        z-index: 20;
        writing-mode: vertical-rl;
        padding: 1rem 0.65rem;
        min-width: 2.75rem;
        border-radius: 0 0.6rem 0.6rem 0;
        background: var(--color-surface, hsl(90 25% 96.863%));
        box-shadow: 0 2px 8px hsl(0 0% 0% / 0.1333);
      }
      .appearance-tab[aria-expanded="true"] {
        background: var(--color-background, hsl(0 0% 100%));
      }
      .appearance {
        position: fixed;
        inset: 50% auto auto 3.25rem;
        transform: translateY(-50%);
        margin: 0;
        width: min(25rem, calc(100vw - 4rem));
        max-height: calc(100dvh - 2rem);
        overflow: auto;
        overscroll-behavior: contain;
        color: var(--color-text, hsl(120 11.111% 14.118%));
        background: var(--color-surface, hsl(90 25% 96.863%));
        border: 1px solid var(--color-border, hsl(120 9.302% 83.137%));
        border-radius: 0.75rem;
        padding: 1rem;
        box-shadow: 0 8px 32px hsl(0 0% 0% / 0.2);
      }
      .appearance-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
      }
      h2 {
        margin: 0;
        font-size: 1rem;
      }
      .appearance-content {
        display: grid;
        gap: 1rem;
        margin-top: 1rem;
      }
      fieldset {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 0.8rem;
        min-width: 0;
        padding: 1rem;
        border: 1px solid var(--color-border, hsl(120 9.302% 83.137%));
        border-radius: 0.5rem;
        margin: 0;
      }
      p {
        margin: 0;
        font-size: 0.85rem;
        line-height: 1.5;
      }
      input {
        font: inherit;
        max-width: 100%;
        min-width: 0;
      }
      label,
      select {
        min-width: 0;
        max-width: 100%;
      }
      .art-samples,
      .clear-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
      }
      .art-sample {
        position: relative;
        display: grid;
        place-items: center;
        width: 4.5rem;
        height: 6.5rem;
        border: 1px solid hsl(104 6.122% 48.039%);
        border-radius: 0.4rem;
        background: hsl(42.857 100% 98.627%);
        color: hsl(120 11.111% 14.118%);
        overflow: hidden;
        text-align: center;
        font-size: 0.8rem;
      }
      .art-sample img {
        width: 100%;
        height: 100%;
        object-fit: fill;
      }
      .art-sample .face-labels {
        position: absolute;
        inset: 0.375rem;
        width: auto;
        height: auto;
      }
      .art-sample img.kenney-art {
        position: absolute;
        left: 50%;
        top: 50%;
        width: 152.380952%;
        height: 106.666667%;
        transform: translate(-50%, -50%);
        image-rendering: pixelated;
      }
      input[type="color"] {
        width: 3rem;
        height: 2.75rem;
        padding: 0.2rem;
        border: 1px solid var(--color-border-strong, hsl(120 7.018% 55.294%));
        border-radius: 0.5rem;
        background: var(--color-background, hsl(0 0% 100%));
        cursor: pointer;
      }
      .basic-back:not(:has(img)) {
        border: 3px double hsl(120 18.182% 87.059%);
        font-size: 1.75rem;
      }
      a {
        color: inherit;
      }
    `,
  ];
}
if (!customElements.get("card-appearance"))
  customElements.define("card-appearance", CardAppearance);

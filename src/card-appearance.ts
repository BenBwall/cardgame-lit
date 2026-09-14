import { LitElement, css, html, nothing } from "lit";
import { live } from "lit/directives/live.js";
import { cardTableStyles } from "./card-table-styles.js";
import {
  type CardArtwork,
  defaultArtwork,
  faceChoices,
  backChoices,
  faceImage,
  backImage,
  importCardImage,
  cardIdFromFilename,
  isArtwork,
  faceContents,
} from "./card-art.js";
import { createDeck, cardId, cardName } from "./cards.js";

export class CardAppearance extends LitElement {
  static properties = {
    value: { attribute: false },
    saveError: { attribute: false },
    uploading: { state: true },
    message: { state: true },
    targetCard: { state: true },
  };
  value: CardArtwork = defaultArtwork();
  saveError = "";
  private uploading = false;
  private message = "";
  private targetCard = "A-Spades";
  private choose(value: CardArtwork): void {
    this.message = "";
    this.dispatchEvent(
      new CustomEvent("artwork-change", { detail: value, bubbles: true, composed: true }),
    );
  }
  private async upload(event: Event, kind: "back" | "face" | "deck"): Promise<void> {
    const input = event.target as HTMLInputElement,
      files = [...(input.files ?? [])];
    if (!files.length || this.uploading) return;
    this.uploading = true;
    this.message = "";
    const target = this.targetCard;
    try {
      if (files.length > 52) throw new Error("Choose at most 52 card images at once.");
      const next = { ...this.value, customFaces: { ...this.value.customFaces } };
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
    return html`<details class="appearance">
      <summary>Card appearance</summary>
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
              @change=${(e: Event) => this.choose({ ...this.value, faces: (e.target as HTMLSelectElement).value })}
            >
              ${faceChoices.map((c) => html`<option value=${c.id} ?selected=${this.value.faces === c.id}>${c.label}</option>`)}
            </select></label
          >
          <label
            >Card back<select
              aria-label="Card back"
              .value=${live(this.value.back)}
              @change=${(e: Event) => this.choose({ ...this.value, back: (e.target as HTMLSelectElement).value })}
            >
              ${backChoices.map((c) => html`<option value=${c.id} ?selected=${this.value.back === c.id} ?disabled=${c.id === "custom" && !this.value.customBack}>${c.label}</option>`)}
            </select></label
          >
          <div class="art-samples" aria-label="Artwork preview">
            <div
              class="art-sample face"
              data-suit=${example.suit}
              role="img"
              aria-label=${`Face preview: ${cardName(example)}`}
            >
              ${front ? html`<img class=${this.value.faces === "kenney" ? "kenney-art" : ""} src=${front} alt="" />` : faceContents(example)}
            </div>
            <div class="art-sample original-back" role="img" aria-label="Back preview">
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
                this.targetCard = (e.target as HTMLSelectElement).value;
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
            <code>K-Clubs.webp</code>. Cards without custom art use the original face.
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
              @click=${() => this.choose({ ...this.value, faces: "original", customFaces: {} })}
            >
              Clear custom faces
            </button>
            <button
              type="button"
              ?disabled=${!this.value.customBack}
              @click=${() => this.choose({ ...this.value, back: "original", customBack: "" })}
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
          >. Original styles remain available.
        </p>
      </div>
    </details>`;
  }
  static styles = [
    cardTableStyles,
    css`
      :host {
        display: block;
        margin-bottom: 1rem;
      }
      .appearance {
        border: 1px solid var(--color-border, #d0d8d0);
        border-radius: 0.6rem;
        padding: 0.75rem;
      }
      summary {
        color: var(--color-text, #202820);
      }
      .appearance-content {
        display: grid;
        gap: 1rem;
        margin-top: 1rem;
      }
      fieldset {
        display: grid;
        gap: 0.8rem;
        min-width: 0;
        padding: 1rem;
        border: 1px solid var(--color-border, #d0d8d0);
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
      select {
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
        border: 1px solid #778273;
        border-radius: 0.4rem;
        background: #fffdf8;
        color: #202820;
        overflow: hidden;
        text-align: center;
        font-size: 0.8rem;
      }
      .art-sample img {
        width: 100%;
        height: 100%;
        object-fit: fill;
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
      .original-back {
        background: repeating-linear-gradient(
          45deg,
          #355342 0px,
          #355342 5px,
          #42634e 5px,
          #42634e 7px
        );
        color: #fffdf8;
      }
      a {
        color: inherit;
      }
    `,
  ];
}
if (!customElements.get("card-appearance"))
  customElements.define("card-appearance", CardAppearance);

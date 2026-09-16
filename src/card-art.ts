import { html, nothing } from "lit";
import {
  backAssets,
  faceAssets,
  wildlifeBackIds,
  type WildlifeBackId,
} from "@cardgame/card-art-assets.js";
import { type Card, type CardId, cardId, createDeck, SUIT_SYMBOLS } from "@cardgame/cards.js";
import { record } from "@cardgame/saved-game.js";
import {
  type HslColor,
  cardPalette,
  cssColor,
  inkColor,
  stripeColor,
  isHslColor,
  colorFromHex,
} from "@cardgame/card-colors.js";

export const basicBackPatterns = ["diagonal", "vertical", "horizontal", "plain"] as const;
export type BasicBackPattern = (typeof basicBackPatterns)[number];
export const faceChoices = [
  { id: "basic", label: "Basic (HTML+CSS)" },
  { id: "kenney", label: "Kenney · Pixel" },
  { id: "wildlife", label: "GreyWyvern · Wildlife" },
  { id: "custom", label: "Custom faces" },
] as const;
export const backChoices = [
  { id: "basic", label: "Basic (HTML+CSS)" },
  { id: "kenney", label: "Kenney · Pixel blue" },
  { id: "wildlife", label: "GreyWyvern · Random per card" },
  ...wildlifeBackIds.map((id, index) => ({ id, label: `GreyWyvern · Back ${index + 1}` }) as const),
  { id: "custom", label: "Custom back" },
] as const;
export type FaceStyle = (typeof faceChoices)[number]["id"];
export type BackStyle = (typeof backChoices)[number]["id"];
export type CustomFaces = Partial<Record<CardId, string>>;
export type CardArtwork = Readonly<{
  faces: FaceStyle;
  back: BackStyle;
  customFaces: Readonly<CustomFaces>;
  customBack: string;
  basicBackColor?: HslColor;
  basicBackSecondaryColor?: HslColor;
  basicBackPattern?: BasicBackPattern;
}>;
export const defaultBasicBackColor = cardPalette.back;
export const defaultArtwork = (): CardArtwork => ({
  faces: "wildlife",
  back: "wildlife",
  customFaces: {},
  customBack: "",
});
export const isFaceStyle = (value: unknown): value is FaceStyle =>
  faceChoices.some((choice) => choice.id === value);
export const isBackStyle = (value: unknown): value is BackStyle =>
  backChoices.some((choice) => choice.id === value);
export const isBasicBackPattern = (value: unknown): value is BasicBackPattern =>
  basicBackPatterns.some((pattern) => pattern === value);
const cardIds: ReadonlySet<string> = new Set(createDeck().map(cardId));
export const isCardId = (value: unknown): value is CardId =>
  typeof value === "string" && cardIds.has(value);
const imageLimits = {
  encodedBytes: 120_000,
  totalBytes: 2_000_000,
  fileBytes: 5_000_000,
  pixels: 16_000_000,
  width: 240,
  height: 348,
  quality: 0.85,
} as const;
const stripePattern = {
  angles: { diagonal: 45, vertical: 90, horizontal: 0 },
  mainWidth: 5,
  repeatWidth: 7,
} as const;
const imageData = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length <= imageLimits.encodedBytes &&
  /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(value);
export function isArtwork(value: unknown): value is CardArtwork {
  return (
    record(value) &&
    isFaceStyle(value.faces) &&
    isBackStyle(value.back) &&
    record(value.customFaces) &&
    Object.entries(value.customFaces).every(([id, data]) => isCardId(id) && imageData(data)) &&
    (value.customBack === "" || imageData(value.customBack)) &&
    (value.basicBackColor === undefined || isHslColor(value.basicBackColor)) &&
    (value.basicBackSecondaryColor === undefined || isHslColor(value.basicBackSecondaryColor)) &&
    (value.basicBackPattern === undefined || isBasicBackPattern(value.basicBackPattern)) &&
    JSON.stringify(value).length <= imageLimits.totalBytes
  );
}
/** Migrate browser saves at the boundary; runtime artwork only uses the current types. */
export function readArtwork(value: unknown): CardArtwork | undefined {
  if (!record(value)) return undefined;
  const migrateColor = (color: unknown): unknown =>
    typeof color === "string" ? (colorFromHex(color) ?? color) : color;
  const migrated = {
    ...value,
    faces: value.faces === "original" ? "basic" : value.faces,
    back: value.back === "original" ? "basic" : value.back,
    basicBackColor: migrateColor(value.basicBackColor),
    basicBackSecondaryColor: migrateColor(value.basicBackSecondaryColor),
  };
  return isArtwork(migrated) ? migrated : undefined;
}
export const faceImage = (art: CardArtwork, card: Card): string =>
  art.faces === "custom"
    ? (art.customFaces[cardId(card)] ?? "")
    : art.faces === "basic"
      ? ""
      : faceAssets[art.faces][cardId(card)];
export const backImage = (art: CardArtwork, card?: Card, assignments?: BackAssignments): string => {
  if (art.back === "basic") return "";
  if (art.back === "custom") return art.customBack;
  const id =
    art.back === "wildlife"
      ? ((card && assignments?.[cardId(card)]) ?? wildlifeBackIds[0])
      : art.back;
  return backAssets[id];
};
export const basicBackStripeColor = (art: CardArtwork): HslColor =>
  art.basicBackSecondaryColor ?? stripeColor(art.basicBackColor ?? defaultBasicBackColor);
export function basicBackBackground(art: CardArtwork): string {
  const color = cssColor(art.basicBackColor ?? defaultBasicBackColor);
  const pattern = art.basicBackPattern ?? "diagonal";
  if (pattern === "plain") return `linear-gradient(${color}, ${color})`;
  const secondary = cssColor(basicBackStripeColor(art));
  return `repeating-linear-gradient(${stripePattern.angles[pattern]}deg, ${color} 0px, ${color} ${stripePattern.mainWidth}px, ${secondary} ${stripePattern.mainWidth}px, ${secondary} ${stripePattern.repeatWidth}px)`;
}
export const basicBackInk = (art: CardArtwork): string =>
  cssColor(inkColor(art.basicBackColor ?? defaultBasicBackColor));
export type BackAssignments = Readonly<Record<CardId, WildlifeBackId>>;
export const newBackAssignments = (random = Math.random): BackAssignments =>
  Object.fromEntries(
    createDeck().map((card) => [
      cardId(card),
      wildlifeBackIds[Math.floor(random() * wildlifeBackIds.length)],
    ]),
  ) as BackAssignments;
export const isBackAssignments = (value: unknown): value is BackAssignments =>
  record(value) &&
  Object.keys(value).length === cardIds.size &&
  [...cardIds].every((id) => wildlifeBackIds.some((back) => back === value[id]));
/** Basic colors inherit through shadow roots. Images are explicit, cloneable img elements. */
export function applyArtwork(host: HTMLElement, art: CardArtwork): void {
  host.style.setProperty("--card-back-pattern", basicBackBackground(art));
  host.style.setProperty("--card-back-ink", basicBackInk(art));
}
export const artLayer = (card: Card, art: CardArtwork) => {
  const source = faceImage(art, card);
  return source
    ? html`<img
        class=${art.faces === "kenney" ? "card-art kenney-art" : "card-art"}
        src=${source}
        alt=""
        aria-hidden="true"
        draggable="false"
      />`
    : nothing;
};
export const faceContents = (card: Card, art: CardArtwork) =>
  html`<span class="face-labels" ?hidden=${!!faceImage(art, card)}
      ><span class="rank">${card.rank}</span><span class="suit">${SUIT_SYMBOLS[card.suit]}</span
      ><span class="rank bottom">${card.rank}</span></span
    >${artLayer(card, art)}`;
// Hidden cards expose only the back image, never a card ID, rank, suit, or mapping key.
export const backContents = (art: CardArtwork, card?: Card, assignments?: BackAssignments) => {
  const source = backImage(art, card, assignments);
  return source
    ? html`<img
        class=${art.back === "kenney" ? "card-back-art kenney-art" : "card-back-art"}
        src=${source}
        alt=""
        aria-hidden="true"
        draggable="false"
      />`
    : html`<span class="back-mark" aria-hidden="true">✦</span>`;
};

export function cardIdFromFilename(name: string): CardId | undefined {
  const match = /^(A|[2-9]|10|J|Q|K)[-_ ](Clubs|Diamonds|Hearts|Spades)\.(png|jpe?g|webp)$/i.exec(
    name,
  );
  if (!match) return undefined;
  const id = `${match[1].toUpperCase()}-${match[2][0].toUpperCase()}${match[2].slice(1).toLowerCase()}`;
  return isCardId(id) ? id : undefined;
}
export async function importCardImage(file: File): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw new Error("Choose a PNG, JPEG, or WebP image.");
  if (file.size > imageLimits.fileBytes) throw new Error("Each image must be smaller than 5 MB.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("This image could not be read. Choose another PNG, JPEG, or WebP file.");
  }
  try {
    if (bitmap.width * bitmap.height > imageLimits.pixels)
      throw new Error("Images must be no larger than 16 megapixels.");
    const canvas = document.createElement("canvas");
    canvas.width = imageLimits.width;
    canvas.height = imageLimits.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image uploads are unavailable in this browser.");
    context.fillStyle = cssColor(cardPalette.paper);
    context.fillRect(0, 0, canvas.width, canvas.height);
    const scale = Math.min(canvas.width / bitmap.width, canvas.height / bitmap.height);
    const width = bitmap.width * scale,
      height = bitmap.height * scale;
    context.drawImage(
      bitmap,
      (canvas.width - width) / 2,
      (canvas.height - height) / 2,
      width,
      height,
    );
    const data = canvas.toDataURL("image/webp", imageLimits.quality);
    if (!imageData(data))
      throw new Error("This image is too detailed to save. Try a simpler image.");
    return data;
  } finally {
    bitmap.close();
  }
}

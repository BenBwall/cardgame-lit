import { html } from "lit";
import { backAssets, faceAssets } from "./card-art-assets.js";
import { type Card, cardId, createDeck, SUIT_SYMBOLS } from "./cards.js";
import { record } from "./saved-game.js";

export type CardArtwork = {
  faces: string;
  back: string;
  customFaces: Record<string, string>;
  customBack: string;
};
export const defaultArtwork = (): CardArtwork => ({
  faces: "original",
  back: "original",
  customFaces: {},
  customBack: "",
});
export const faceChoices = [
  { id: "original", label: "Original" },
  { id: "kenney", label: "Kenney · Pixel" },
  { id: "wildlife", label: "GreyWyvern · Wildlife" },
  { id: "custom", label: "Custom faces" },
];
export const backChoices = [
  { id: "original", label: "Original · Green" },
  { id: "kenney", label: "Kenney · Pixel blue" },
  { id: "wildlife", label: "GreyWyvern · Random per card" },
  ..."123456789abcd"
    .split("")
    .map((id, i) => ({ id: `wildlife-${id}`, label: `GreyWyvern · Back ${i + 1}` })),
  { id: "custom", label: "Custom back" },
];
const cardIds = new Set(createDeck().map(cardId));
const imageData = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length <= 120_000 &&
  /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(value);
export function isArtwork(value: unknown): value is CardArtwork {
  return (
    record(value) &&
    faceChoices.some((c) => c.id === value.faces) &&
    backChoices.some((c) => c.id === value.back) &&
    record(value.customFaces) &&
    Object.entries(value.customFaces).every(([id, data]) => cardIds.has(id) && imageData(data)) &&
    (value.customBack === "" || imageData(value.customBack)) &&
    JSON.stringify(value).length <= 2_000_000
  );
}
export const faceImage = (art: CardArtwork, card: Card): string =>
  art.faces === "custom"
    ? (art.customFaces[cardId(card)] ?? "")
    : (faceAssets[art.faces]?.[cardId(card)] ?? "");
export const backImage = (art: CardArtwork): string =>
  art.back === "custom"
    ? art.customBack
    : (backAssets[art.back === "wildlife" ? "wildlife-1" : art.back] ?? "");
export type BackAssignments = Record<string, string>;
const randomBackIds = "123456789abcd".split("").map((id) => `wildlife-${id}`);
export const newBackAssignments = (random = Math.random): BackAssignments =>
  Object.fromEntries(
    createDeck().map((card) => [
      cardId(card),
      randomBackIds[Math.floor(random() * randomBackIds.length)],
    ]),
  );
export const isBackAssignments = (value: unknown): value is BackAssignments =>
  record(value) &&
  Object.keys(value).length === 52 &&
  [...cardIds].every((id) => randomBackIds.includes(value[id] as string));
// Only the image is placed on a hidden card: never its rank, suit, or mapping key.
export const cardBackStyle = (card: Card | undefined, assignments: BackAssignments): string => {
  const image = card && backAssets[assignments[cardId(card)]];
  return image ? `--card-random-back-image:url("${image}");` : "";
};
export function applyArtwork(host: HTMLElement, art: CardArtwork): void {
  host.toggleAttribute("random-backs", art.back === "wildlife");
  // Kenney's 64x64 sprites contain a centered 42x60 card, with transparent gutters.
  host.style.setProperty(
    "--card-art-size",
    art.faces === "kenney" ? "152.380952% 106.666667%" : "100% 100%",
  );
  host.style.setProperty(
    "--card-back-size",
    art.back === "kenney" ? "152.380952% 106.666667%" : "100% 100%",
  );
  for (const card of createDeck()) {
    const id = cardId(card),
      image = faceImage(art, card);
    host.style.setProperty(`--card-art-${id}`, image ? `url("${image}")` : "none");
    host.style.setProperty(`--card-label-${id}`, image ? "hidden" : "visible");
  }
  const back = backImage(art);
  if (back) {
    host.style.setProperty("--card-back-image", `url("${back}")`);
    host.style.setProperty("--card-back-ink", "transparent");
    host.style.setProperty("--card-back-mark-visibility", "hidden");
  } else {
    host.style.removeProperty("--card-back-image");
    host.style.removeProperty("--card-back-ink");
    host.style.removeProperty("--card-back-mark-visibility");
  }
  host.style.setProperty("--card-art-rendering", art.faces === "kenney" ? "pixelated" : "auto");
}
export const artLayer = (card: Card) =>
  html`<span
    class="card-art"
    aria-hidden="true"
    style=${`background-image:var(--card-art-${cardId(card)},none)`}
  ></span>`;
export const faceContents = (card: Card) =>
  html`<span class="face-labels" style=${`visibility:var(--card-label-${cardId(card)},visible)`}
      ><span class="rank">${card.rank}</span><span class="suit">${SUIT_SYMBOLS[card.suit]}</span
      ><span class="rank bottom">${card.rank}</span></span
    >${artLayer(card)}`;

export function cardIdFromFilename(name: string): string | undefined {
  const match = /^(A|[2-9]|10|J|Q|K)[-_ ](Clubs|Diamonds|Hearts|Spades)\.(png|jpe?g|webp)$/i.exec(
    name,
  );
  if (!match) return undefined;
  return `${match[1].toUpperCase()}-${match[2][0].toUpperCase()}${match[2].slice(1).toLowerCase()}`;
}
export async function importCardImage(file: File): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw new Error("Choose a PNG, JPEG, or WebP image.");
  if (file.size > 5_000_000) throw new Error("Each image must be smaller than 5 MB.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("This image could not be read. Choose another PNG, JPEG, or WebP file.");
  }
  try {
    if (bitmap.width * bitmap.height > 16_000_000)
      throw new Error("Images must be no larger than 16 megapixels.");
    const canvas = document.createElement("canvas");
    canvas.width = 240;
    canvas.height = 348;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image uploads are unavailable in this browser.");
    context.fillStyle = "#fffdf8";
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
    const data = canvas.toDataURL("image/webp", 0.85);
    if (!imageData(data))
      throw new Error("This image is too detailed to save. Try a simpler image.");
    return data;
  } finally {
    bitmap.close();
  }
}

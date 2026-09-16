// Original CC0 PNG files. See CARD-ART-LICENSES.md for sources and licenses.
import { createDeck, cardId, type CardId } from "@cardgame/cards.js";

export const wildlifeBackIds = [
  "wildlife-1",
  "wildlife-2",
  "wildlife-3",
  "wildlife-4",
  "wildlife-5",
  "wildlife-6",
  "wildlife-7",
  "wildlife-8",
  "wildlife-9",
  "wildlife-a",
  "wildlife-b",
  "wildlife-c",
  "wildlife-d",
] as const;
export type WildlifeBackId = (typeof wildlifeBackIds)[number];
export type BuiltInFaces = "kenney" | "wildlife";
export type BuiltInBack = "kenney" | WildlifeBackId;
export type FaceAssets = Readonly<Record<CardId, string>>;

const assetUrl = (path: string): string =>
  new URL(`./assets/cards/${path}.png`, import.meta.url).href;
const deckAssets = (deck: BuiltInFaces): FaceAssets =>
  Object.fromEntries(
    createDeck().map((card) => [cardId(card), assetUrl(`${deck}/${cardId(card)}`)]),
  ) as FaceAssets;

export const faceAssets = {
  kenney: deckAssets("kenney"),
  wildlife: deckAssets("wildlife"),
} as const;
export const backAssets: Readonly<Record<BuiltInBack, string>> = {
  kenney: assetUrl("backs/kenney"),
  ...Object.fromEntries(wildlifeBackIds.map((id) => [id, assetUrl(`backs/${id}`)])),
} as Record<BuiltInBack, string>;

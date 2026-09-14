import { expect, test } from "bun:test";
import { createDeck, cardId } from "../src/cards.js";
import { backAssets, faceAssets } from "../src/card-art-assets.js";
import {
  defaultArtwork,
  isArtwork,
  cardIdFromFilename,
  newBackAssignments,
  isBackAssignments,
} from "../src/card-art.js";

test("both alternative decks have all 52 cards and 14 PNG backs", () => {
  for (const deck of Object.values(faceAssets)) {
    expect(Object.keys(deck).sort()).toEqual(createDeck().map(cardId).sort());
    for (const data of Object.values(deck))
      expect(Buffer.from(data.split(",")[1], "base64").subarray(1, 4).toString()).toBe("PNG");
  }
  expect(Object.keys(backAssets)).toHaveLength(14);
});
test("custom artwork validates image data, known cards, sizes and file names", () => {
  const art = defaultArtwork();
  expect(isArtwork(art)).toBe(true);
  expect(isArtwork({ ...art, customFaces: { "A-Spades": faceAssets.kenney["A-Spades"] } })).toBe(
    true,
  );
  expect(isArtwork({ ...art, faces: "missing" })).toBe(false);
  expect(isArtwork({ ...art, customFaces: { "1-Spades": "data:image/png;base64,AAAA" } })).toBe(
    false,
  );
  for (const customBack of [
    "https://example.org/tracker.png",
    "data:image/svg+xml;base64,AAAA",
    "data:image/png;base64," + "A".repeat(120_000),
  ])
    expect(isArtwork({ ...art, customBack })).toBe(false);
  expect(cardIdFromFilename("a_spades.PNG")).toBe("A-Spades");
  expect(cardIdFromFilename("10-Hearts.jpg")).toBe("10-Hearts");
  expect(cardIdFromFilename("back.png")).toBeUndefined();
});

test("random backs assign every card once and validate saved assignments", () => {
  let i = 0;
  const assignments = newBackAssignments(() => (i++ % 13) / 13);
  expect(isBackAssignments(assignments)).toBe(true);
  expect(new Set(Object.values(assignments)).size).toBe(13);
  expect(isBackAssignments(JSON.parse(JSON.stringify(assignments)))).toBe(true);
  expect(isBackAssignments({ ...assignments, "A-Clubs": "kenney" })).toBe(false);
  expect(isBackAssignments({})).toBe(false);
  expect(isArtwork({ ...defaultArtwork(), back: "wildlife" })).toBe(true);
});

import { readFileSync } from "node:fs";
import { colorFromHex, colorToHex } from "@cardgame/card-colors.js";
import { expect, test } from "bun:test";
import { createDeck, cardId } from "@cardgame/cards.js";
import { backAssets, faceAssets } from "@cardgame/card-art-assets.js";
import {
  defaultArtwork,
  isArtwork,
  readArtwork,
  cardIdFromFilename,
  newBackAssignments,
  isBackAssignments,
  basicBackStripeColor,
} from "@cardgame/card-art.js";

test("both alternative decks have all 52 cards and 14 PNG backs", () => {
  for (const deck of Object.values(faceAssets)) {
    expect(Object.keys(deck).sort()).toEqual(createDeck().map(cardId).sort());
    for (const data of Object.values(deck))
      expect(readFileSync(new URL(data)).subarray(1, 4).toString()).toBe("PNG");
  }
  expect(Object.keys(backAssets)).toHaveLength(14);
});
test("custom artwork validates image data, known cards, sizes and file names", () => {
  const art = defaultArtwork();
  expect(isArtwork(art)).toBe(true);
  expect(isArtwork({ ...art, customFaces: { "A-Spades": "data:image/png;base64,AAAA" } })).toBe(
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

test("GreyWyvern defaults and validated basic-back settings preserve legacy artwork", () => {
  const art = defaultArtwork();
  expect(art).toMatchObject({ faces: "wildlife", back: "wildlife" });
  expect(
    !!readArtwork({ faces: "original", back: "original", customFaces: {}, customBack: "" }),
  ).toBe(true);
  for (const basicBackPattern of ["diagonal", "vertical", "horizontal", "plain"])
    expect(isArtwork({ ...art, basicBackColor: colorFromHex("#AABBCC"), basicBackPattern })).toBe(
      true,
    );
  for (const basicBackColor of [
    null,
    42,
    "red",
    "#fff",
    "#gggggg",
    "url(https://example.com)",
    "#123456;display:none",
  ])
    expect(isArtwork({ ...art, basicBackColor })).toBe(false);
  for (const basicBackPattern of [null, 45, "dots", "url(https://example.com)"])
    expect(isArtwork({ ...art, basicBackPattern })).toBe(false);
  expect(isArtwork({ ...art, basicBackSecondaryColor: colorFromHex("#aAbBcC") })).toBe(true);
  for (const basicBackSecondaryColor of [null, 42, "", "red", "#fff", "url(https://example.com)"])
    expect(isArtwork({ ...art, basicBackSecondaryColor })).toBe(false);
  expect(colorToHex(basicBackStripeColor(art))).toBe("#4b765e");
  expect(
    colorToHex(basicBackStripeColor({ ...art, basicBackColor: colorFromHex("#000000") })),
  ).toBe("#262626");
  expect(
    colorToHex(basicBackStripeColor({ ...art, basicBackColor: colorFromHex("#ffffff") })),
  ).toBe("#ffffff");
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

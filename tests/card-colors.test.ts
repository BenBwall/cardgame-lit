import { expect, test } from "bun:test";
import { colorFromHex, colorToHex, isHslColor, stripeColor } from "@cardgame/card-colors.js";
import { defaultArtwork, isArtwork, readArtwork } from "@cardgame/card-art.js";

test("native color input conversion round-trips chromatic and neutral colors", () => {
  for (const color of [
    "#000000",
    "#000101",
    "#feffff",
    "#ffffff",
    "#808080",
    "#ff0000",
    "#00ff00",
    "#0000ff",
    "#355342",
    "#8844cc",
    "#ff8800",
  ]) {
    const hsl = colorFromHex(color)!;
    expect(isHslColor(hsl)).toBe(true);
    expect(colorToHex(hsl)).toBe(color);
    expect(isHslColor(stripeColor(hsl))).toBe(true);
  }
});

test("HSL validation rejects nonfinite values, out-of-range channels, and CSS injection", () => {
  for (const value of [
    null,
    "hsl(0 0% 0%);display:none",
    { hue: NaN, saturation: 0, lightness: 0 },
    { hue: 360, saturation: 0, lightness: 0 },
    { hue: 0, saturation: 101, lightness: 50 },
    { hue: 0, saturation: 0, lightness: -1 },
    { hue: 0, saturation: 0, lightness: Infinity },
  ]) {
    expect(isHslColor(value)).toBe(false);
    expect(isArtwork({ ...defaultArtwork(), basicBackColor: value })).toBe(false);
    expect(readArtwork({ ...defaultArtwork(), basicBackSecondaryColor: value })).toBeUndefined();
  }
});

test("legacy saves migrate both style IDs and colors without losing uploaded artwork", () => {
  const uploaded = "data:image/png;base64,AAAA";
  const legacy = {
    faces: "original",
    back: "original",
    customFaces: { "A-Spades": uploaded },
    customBack: uploaded,
    basicBackColor: "#355342",
    basicBackSecondaryColor: "#ff8800",
    basicBackPattern: "vertical",
  };
  const migrated = readArtwork(legacy)!;
  expect(isArtwork(legacy)).toBe(false);
  expect(isArtwork(migrated)).toBe(true);
  expect(migrated).toMatchObject({
    faces: "basic",
    back: "basic",
    customFaces: legacy.customFaces,
    customBack: uploaded,
    basicBackPattern: "vertical",
  });
  expect(colorToHex(migrated.basicBackColor!)).toBe(legacy.basicBackColor);
  expect(colorToHex(migrated.basicBackSecondaryColor!)).toBe(legacy.basicBackSecondaryColor);
  expect(readArtwork(JSON.parse(JSON.stringify(migrated)))).toEqual(migrated);
  expect(legacy.faces).toBe("original");
  expect(readArtwork({ ...legacy, basicBackColor: "invalid" })).toBeUndefined();
  expect(readArtwork({ ...legacy, faces: "missing" })).toBeUndefined();
});

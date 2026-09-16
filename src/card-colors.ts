import { record } from "@cardgame/saved-game.js";

export type HslColor = Readonly<{ hue: number; saturation: number; lightness: number }>;

export const cardPalette = {
  back: { hue: 146, saturation: 22, lightness: 27 },
  ink: { hue: 120, saturation: 11, lightness: 14 },
  paper: { hue: 43, saturation: 100, lightness: 99 },
} as const satisfies Readonly<Record<string, HslColor>>;
export const STRIPE_LIGHTENING = 0.15;
const LIGHT_INK_THRESHOLD = 60;
const CHANNEL_MAX = 255;
const HUE_SECTOR = 60;
const FULL_TURN = 360;

export const isHslColor = (value: unknown): value is HslColor =>
  record(value) &&
  typeof value.hue === "number" &&
  Number.isFinite(value.hue) &&
  value.hue >= 0 &&
  value.hue < FULL_TURN &&
  typeof value.saturation === "number" &&
  Number.isFinite(value.saturation) &&
  value.saturation >= 0 &&
  value.saturation <= 100 &&
  typeof value.lightness === "number" &&
  Number.isFinite(value.lightness) &&
  value.lightness >= 0 &&
  value.lightness <= 100;

export const cssColor = (color: HslColor): string =>
  `hsl(${color.hue} ${color.saturation}% ${color.lightness}%)`;
export const stripeColor = (color: HslColor): HslColor => ({
  ...color,
  lightness: color.lightness + (100 - color.lightness) * STRIPE_LIGHTENING,
});
export const inkColor = (color: HslColor): HslColor =>
  color.lightness > LIGHT_INK_THRESHOLD ? cardPalette.ink : cardPalette.paper;

// Hex is restricted to the native color input and migration of old browser saves.
export function colorFromHex(value: string): HslColor | undefined {
  if (!/^#[\da-f]{6}$/i.test(value)) return undefined;
  const channels = [1, 3, 5].map(
    (offset) => parseInt(value.slice(offset, offset + 2), 16) / CHANNEL_MAX,
  );
  const [red, green, blue] = channels;
  const high = Math.max(...channels),
    low = Math.min(...channels);
  const chroma = high - low,
    lightness = (high + low) / 2;
  const hue =
    chroma === 0
      ? 0
      : high === red
        ? ((green - blue) / chroma + 6) % 6
        : high === green
          ? (blue - red) / chroma + 2
          : (red - green) / chroma + 4;
  return {
    hue: hue * HUE_SECTOR,
    // Floating-point cancellation near black/white can exceed 100 by an epsilon.
    saturation:
      chroma === 0 ? 0 : Math.min(100, (chroma / (1 - Math.abs(2 * lightness - 1))) * 100),
    lightness: lightness * 100,
  };
}

export function colorToHex(color: HslColor): string {
  const lightness = color.lightness / 100;
  const amplitude = (color.saturation / 100) * Math.min(lightness, 1 - lightness);
  const channel = (offset: number): string => {
    const sector = (offset + color.hue / (HUE_SECTOR / 2)) % 12;
    const value = lightness - amplitude * Math.max(-1, Math.min(sector - 3, 9 - sector, 1));
    return Math.round(value * CHANNEL_MAX)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

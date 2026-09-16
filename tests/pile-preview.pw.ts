import { expect, test } from "@playwright/test";
import { createDeck, cardName } from "../src/cards.js";
import { DEFAULT_SHITHEAD_RULES, type ShitheadState } from "../src/shithead-state.js";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("tab", { name: "Shithead", exact: true }).click();
  await page.getByRole("tab", { name: "Single player", exact: true }).click();
});

test("pile previews show all public cards in order without playing or revealing hidden cards", async ({
  page,
}) => {
  const cards = createDeck();
  const state: ShitheadState = {
    rules: { ...DEFAULT_SHITHEAD_RULES, voluntaryPickup: false },
    phase: "playing",
    turn: 0,
    winner: null,
    message: "Your turn.",
    players: [
      { hand: [cards[0]], faceUp: [], faceDown: [] },
      { hand: [cards[1]], faceUp: [], faceDown: [] },
    ],
    stock: cards.slice(2, 5),
    pile: cards.slice(5, 11),
    burned: cards.slice(11),
  };
  const game = page.locator("shithead-game");
  await game.evaluate((node, state) => {
    (node as unknown as { game: ShitheadState }).game = state;
  }, state);
  const pile = game.getByRole("group", { name: "Play pile contents", exact: true });
  const out = game.getByRole("group", { name: "Out pile contents", exact: true });
  await expect(game.getByRole("button", { name: "Pick up pile", exact: true })).toBeDisabled();
  await pile.hover();
  const preview = game.getByRole("tooltip");
  await expect(preview).toBeVisible();
  expect(
    await preview
      .locator("li")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label"))),
  ).toEqual([...state.pile].reverse().map(cardName));
  await preview.hover();
  await expect(preview).toBeVisible();
  await game.getByRole("heading", { name: "Shithead", exact: true }).hover();
  await expect(preview).toHaveCount(0);
  await out.focus();
  await expect(preview.locator("li")).toHaveCount(state.burned.length);
  expect(
    await preview
      .locator("li")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label"))),
  ).toEqual([...state.burned].reverse().map(cardName));
  await page.keyboard.press("Escape");
  await expect(preview).toHaveCount(0);
  expect(await game.evaluate((node) => (node as unknown as { game: ShitheadState }).game)).toEqual(
    state,
  );
  for (const theme of ["dark", "light"] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await page.setViewportSize({ width: 320, height: 900 });
    await game.getByRole("heading", { name: "Shithead", exact: true }).hover();
    await out.hover();
    const rect = await preview.boundingBox();
    expect(rect!.x).toBeGreaterThanOrEqual(0);
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(320);
    expect(await preview.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
    await page.keyboard.press("Escape");
  }
});

test("empty piles have previews and focusing or hovering never picks them up", async ({ page }) => {
  const game = page.locator("shithead-game");
  for (const name of ["Play pile contents", "Out pile contents"]) {
    await game.getByRole("group", { name, exact: true }).focus();
    await expect(game.getByRole("tooltip")).toHaveText(/Empty pile/);
    await page.keyboard.press("Escape");
    await expect(game.getByRole("tooltip")).toHaveCount(0);
  }
  await expect(game.getByRole("button", { name: "Start game", exact: true })).toBeVisible();
});

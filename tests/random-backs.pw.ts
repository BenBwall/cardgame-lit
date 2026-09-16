import { expect, test, type Page } from "@playwright/test";
import { type BackAssignments } from "@cardgame/card-art.js";
import { backAssets as assetUrls } from "@cardgame/card-art-assets.js";
import { type GameState } from "@cardgame/game-state.js";
import { type ShitheadState } from "@cardgame/shithead-state.js";
import { cardId } from "@cardgame/cards.js";

const backAssets = Object.fromEntries(
  Object.entries(assetUrls).map(([id, source]) => [
    id,
    `/${source.slice(source.indexOf("assets/cards/"))}`,
  ]),
);

const settings = (page: Page) => page.locator("card-appearance");
const assignments = (page: Page, selector = "card-game") =>
  page
    .locator(selector)
    .evaluate((node) => (node as unknown as { backAssignments: BackAssignments }).backAssignments);
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await settings(page).getByRole("button", { name: "Card appearance", exact: true }).click();
});
test("Kenney faces, backs and previews remove the square sprite gutters", async ({ page }) => {
  await settings(page)
    .getByRole("combobox", { name: "Card faces", exact: true })
    .selectOption("kenney");
  await settings(page)
    .getByRole("combobox", { name: "Card back", exact: true })
    .selectOption("kenney");
  const image = settings(page).locator(".art-sample img").first();
  expect(
    await image.evaluate((node) => {
      const rect = node.getBoundingClientRect(),
        frame = node.parentElement!.getBoundingClientRect();
      return rect.width / frame.width;
    }),
  ).toBeGreaterThan(1.45);
  await settings(page).getByRole("button", { name: "Card appearance", exact: true }).click();
  await page.getByRole("button", { name: "Draw a card", exact: true }).click();
  for (const selector of ["card-game .hand .card-art", "card-game #draw-card img"]) {
    const [width, height] = await page
      .locator(selector)
      .first()
      .evaluate((node) => {
        const image = node.getBoundingClientRect();
        const frame = node.parentElement!;
        return [(image.width / frame.clientWidth) * 100, (image.height / frame.clientHeight) * 100];
      });
    expect(width).toBeCloseTo((64 / 42) * 100, 1);
    expect(height).toBeCloseTo((64 / 60) * 100, 1);
  }
});
test("free-play random backs follow each card and persist until a new deck", async ({ page }) => {
  await settings(page)
    .getByRole("combobox", { name: "Card back", exact: true })
    .selectOption("wildlife");
  await settings(page).getByRole("button", { name: "Card appearance", exact: true }).click();
  const before = await assignments(page);
  expect(Object.keys(before)).toHaveLength(52);
  expect(new Set(Object.values(before)).size).toBeGreaterThan(1);
  const state = await page
    .locator("card-game")
    .evaluate((node) => (node as unknown as { game: GameState }).game);
  const expected = backAssets[before[cardId(state.deck.at(-1)!)]];
  expect(
    await page.locator("#draw-card").evaluate((node) => node.querySelector("img")!.src),
  ).toContain(expected);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByRole("button", { name: "Draw a card", exact: true }).click();
  const flight = page.locator("card-game .card-flight .flight-back");
  await expect(flight).toHaveCount(1);
  expect(await flight.evaluate((node) => node.querySelector("img")!.src)).toContain(expected);
  await expect(page.locator("card-game .card-flight")).toHaveCount(0);
  await page.reload();
  expect(await assignments(page)).toEqual(before);
  expect(
    await page
      .locator("card-game .hand .flight-back")
      .evaluate((node) => node.querySelector("img")!.src),
  ).toContain(expected);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(await assignments(page)).toEqual(before);
  await settings(page).getByRole("button", { name: "Card appearance", exact: true }).click();
  await settings(page)
    .getByRole("combobox", { name: "Card back", exact: true })
    .selectOption("kenney");
  await settings(page)
    .getByRole("combobox", { name: "Card back", exact: true })
    .selectOption("wildlife");
  expect(await assignments(page)).toEqual(before);
  await settings(page).getByRole("button", { name: "Card appearance", exact: true }).click();
  await page.getByRole("button", { name: "New deck", exact: true }).click();
  expect(await assignments(page)).not.toEqual(before);
});
test("Shithead keeps each hidden card's back across refreshes and mode switches", async ({
  page,
}) => {
  await settings(page)
    .getByRole("combobox", { name: "Card back", exact: true })
    .selectOption("wildlife");
  await settings(page).getByRole("button", { name: "Card appearance", exact: true }).click();
  await page.getByRole("tab", { name: "Shithead", exact: true }).click();
  await page.getByRole("tab", { name: "Single player", exact: true }).click();
  const game = page.locator("shithead-game");
  const before = await assignments(page, "shithead-game");
  const state = await game.evaluate((node) => (node as unknown as { game: ShitheadState }).game);
  const backs = await game
    .locator(".opponent-hand .back")
    .evaluateAll((nodes) => nodes.map((node) => node.querySelector("img")!.src));
  for (const [i, card] of state.players[1].hand.entries())
    expect(backs[i]).toContain(backAssets[before[cardId(card)]]);
  expect(
    await game
      .locator('[data-board-zone="stock"]')
      .evaluate((node) => node.querySelector("img")!.src),
  ).toContain(backAssets[before[cardId(state.stock.at(-1)!)]]);
  await page.reload();
  expect(await assignments(page, "shithead-game")).toEqual(before);
  expect(
    await game
      .locator(".opponent-hand .back")
      .evaluateAll((nodes) => nodes.map((node) => node.querySelector("img")!.src)),
  ).toEqual(backs);
  await page.getByRole("tab", { name: "Free play", exact: true }).click();
  await page.getByRole("tab", { name: "Shithead", exact: true }).click();
  await page.getByRole("tab", { name: "Single player", exact: true }).click();
  expect(await assignments(page, "shithead-game")).toEqual(before);
  await game.getByRole("button", { name: "New game", exact: true }).click();
  await game.getByRole("button", { name: "Deal new game", exact: true }).click();
  expect(await assignments(page, "shithead-game")).not.toEqual(before);
});

test("computer draw animations keep the individual backs of all incoming hidden cards", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 1500 });
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await settings(page)
    .getByRole("combobox", { name: "Card back", exact: true })
    .selectOption("wildlife");
  await settings(page).getByRole("button", { name: "Card appearance", exact: true }).click();
  await page.getByRole("tab", { name: "Shithead", exact: true }).click();
  await page.getByRole("tab", { name: "Single player", exact: true }).click();
  const game = page.locator("shithead-game");
  const backs = await assignments(page, "shithead-game");
  const original = await game.evaluate((node) => (node as unknown as { game: ShitheadState }).game);
  const old: ShitheadState = {
    ...original,
    phase: "playing",
    turn: 1,
    burned: original.players[1].hand.slice(1),
    players: [
      original.players[0],
      { ...original.players[1], hand: original.players[1].hand.slice(0, 1) },
    ],
  };
  await game.evaluate(async (node, state) => {
    const ui = node as unknown as { game: ShitheadState; updateComplete: Promise<unknown> };
    ui.game = state;
    await ui.updateComplete;
  }, old);
  const drawn = old.stock.slice(-3).reverse();
  const next: ShitheadState = {
    ...old,
    turn: 0,
    stock: old.stock.slice(0, -3),
    pile: old.players[1].hand,
    players: [old.players[0], { ...old.players[1], hand: drawn }],
  };
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await game.evaluate((node, state) => {
    void (node as unknown as { commit: (value: ShitheadState) => Promise<void> }).commit(state);
  }, next);
  const flights = game.locator(".board-flight.back");
  await expect(flights).toHaveCount(3);
  const images = await flights.evaluateAll((nodes) =>
    nodes.map((node) => node.querySelector("img")!.src),
  );
  for (const card of drawn)
    expect(images.some((image) => image.includes(backAssets[backs[cardId(card)]]))).toBe(true);
  await expect(flights.locator(".flight-front")).toHaveCount(0);
  expect(
    await flights.evaluateAll((nodes) =>
      nodes.every(
        (node) => !node.hasAttribute("data-card-id") && !node.hasAttribute("data-board-key"),
      ),
    ),
  ).toBe(true);
  await page.clock.runFor(2000);
  await expect(flights).toHaveCount(0);
});

import { expect, test } from "@playwright/test";
import { type ShitheadState, DEFAULT_SHITHEAD_RULES } from "../src/shithead-state.js";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("Shithead setup, keyboard play, hidden cards, computer turns and reset work offline", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Math.random = () => 0.5;
  });
  await page.goto("/");
  await page.getByRole("combobox", { name: "Game", exact: true }).selectOption("shithead");
  const game = page.locator("shithead-game");
  await context.setOffline(true);
  const hand = game.getByRole("list", { name: "Your hand", exact: true });
  const up = game.locator(".your-table .upper-card");
  await expect(hand.getByRole("button")).toHaveCount(3);
  await expect(up.getByRole("button")).toHaveCount(3);
  const first = await hand.getByRole("button").first().getAttribute("aria-label");
  await hand.getByRole("button").first().focus();
  await page.keyboard.press("Enter");
  await up.getByRole("button").first().click();
  await expect(up.getByRole("button").first()).toHaveAttribute("aria-label", first!);
  const down = game.locator(".your-table");
  expect(
    await down
      .locator(".lower-card")
      .evaluateAll((nodes) => nodes.map((node) => node.outerHTML).join("")),
  ).not.toMatch(/data-suit|Clubs|Hearts|Diamonds|Spades/);
  await game.getByRole("button", { name: "Start game", exact: true }).click();
  const playable = game.locator('button[aria-label^="Play "][aria-disabled="false"]');
  await expect(playable.first()).toBeEnabled();
  await playable.first().focus();
  await page.keyboard.press("Space");
  const selected = game.getByRole("button", { name: "Play selected (1)", exact: true });
  if (await selected.count()) await selected.click();
  await expect(game.getByRole("status")).toContainText(/played/);
  await expect(playable.first()).toBeEnabled({ timeout: 10000 });
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        .toBe(true);
    }
  }
  await game.getByRole("button", { name: "New game", exact: true }).click();
  await game.getByRole("button", { name: "Deal new game", exact: true }).click();
  await expect(game.getByRole("button", { name: "Start game", exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Game", exact: true }).selectOption("free-play");
  await page.getByRole("button", { name: "Draw a card" }).click();
  await expect(page.getByRole("heading", { name: "Your hand (1)" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("matching sets burn, blind failures pick up, and the final card ends the game", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("combobox", { name: "Game", exact: true }).selectOption("shithead");
  const game = page.locator("shithead-game");
  const setState = async (state: ShitheadState) => {
    await game.evaluate((element, value) => {
      (element as unknown as { game: ShitheadState }).game = value;
    }, state);
  };
  const state: ShitheadState = {
    rules: DEFAULT_SHITHEAD_RULES,
    players: [
      {
        hand: [
          { rank: "4", suit: "Clubs" },
          { rank: "4", suit: "Hearts" },
        ],
        faceUp: [],
        faceDown: [{ rank: "3", suit: "Spades" }],
      },
      {
        hand: [{ rank: "K", suit: "Hearts" }],
        faceUp: [],
        faceDown: [{ rank: "5", suit: "Clubs" }],
      },
    ],
    stock: [],
    pile: [
      { rank: "4", suit: "Spades" },
      { rank: "4", suit: "Diamonds" },
    ],
    burned: [],
    phase: "playing",
    turn: 0,
    winner: null,
    message: "Your turn.",
  };
  await setState(state);
  await game.getByRole("button", { name: "Select matching cards", exact: true }).click();
  await game.getByRole("button", { name: "Select 4 of Clubs", exact: true }).click();
  await game.getByRole("button", { name: "Select 4 of Hearts", exact: true }).click();
  await game.getByRole("button", { name: "Play selected (2)", exact: true }).click();
  await expect(game.getByRole("status")).toContainText("Pile burned!");
  await expect(
    game.getByRole("button", { name: "Reveal face-down card 1", exact: true }),
  ).toBeEnabled();
  await page.clock.install();
  await setState({
    ...state,
    players: [{ ...state.players[0], hand: [] }, state.players[1]],
    pile: [{ rank: "K", suit: "Diamonds" }],
  });
  await game.getByRole("button", { name: "Reveal face-down card 1", exact: true }).click();
  await expect(game.getByRole("status")).toContainText(
    "revealed 3 of Spades and picked up 2 cards",
  );
  await expect(game.getByRole("heading", { name: "Your hand (2)" })).toBeVisible();
  await page.clock.fastForward(800);
  await expect(game.getByRole("status")).toContainText("Computer played");
  await setState({
    ...state,
    players: [
      { hand: [], faceUp: [], faceDown: [{ rank: "10", suit: "Clubs" }] },
      state.players[1],
    ],
  });
  await game.getByRole("button", { name: "Reveal face-down card 1", exact: true }).click();
  await expect(game.getByRole("status")).toContainText("You are out!");
  await expect(game.getByRole("button", { name: "Pick up pile", exact: true })).toBeDisabled();
  await expect(
    game.getByRole("button", { name: "Select matching cards", exact: true }),
  ).toBeDisabled();
});

test("leaving pauses a pending computer turn and reentry resumes it", async ({ page }) => {
  await page.goto("/");
  await page.clock.install();
  const mode = page.getByRole("combobox", { name: "Game", exact: true });
  await mode.selectOption("shithead");
  await page.locator("shithead-game").evaluate((element) => {
    const game = element as unknown as { game: ShitheadState };
    game.game = { ...game.game, phase: "playing", turn: 1 };
  });
  await mode.selectOption("free-play");
  await page.clock.fastForward(1000);
  await mode.selectOption("shithead");
  await expect(page.getByRole("button", { name: "Start game", exact: true })).toHaveCount(0);
  await page.clock.fastForward(1000);
  await expect(page.getByRole("status")).toContainText("Computer played");
});

test("Options tabs support keyboard navigation, setup edits, paused turns and next-deal rules", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("combobox", { name: "Game", exact: true }).selectOption("shithead");
  const game = page.locator("shithead-game");
  await game.getByRole("tab", { name: "Table", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(game.getByRole("tab", { name: "Options", exact: true })).toBeFocused();
  const pickup = game.getByRole("checkbox", { name: "Allow voluntary pile pickup", exact: true });
  const two = game.getByRole("checkbox", { name: "Play again after a 2", exact: true });
  const reveal = game.getByRole("checkbox", { name: "Reveal the card underneath", exact: true });
  await expect(pickup).toBeChecked();
  await expect(two).not.toBeChecked();
  await expect(reveal).not.toBeChecked();
  await pickup.uncheck();
  await two.check();
  await reveal.check();
  const rules = await game.evaluate(
    (element) => (element as unknown as { game: ShitheadState }).game.rules,
  );
  expect(rules).toEqual({ voluntaryPickup: false, playAgainAfterTwo: true, revealUncovered: true });
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        .toBe(true);
    }
  }
  await page.clock.install();
  await game.evaluate((element) => {
    const component = element as unknown as { game: ShitheadState };
    component.game = { ...component.game, phase: "playing", turn: 1 };
  });
  const before = await game.evaluate(
    (element) => (element as unknown as { game: ShitheadState }).game,
  );
  await page.clock.fastForward(2000);
  expect(
    await game.evaluate((element) => (element as unknown as { game: ShitheadState }).game),
  ).toEqual(before);
  await pickup.check();
  expect(
    await game.evaluate(
      (element) => (element as unknown as { game: ShitheadState }).game.rules.voluntaryPickup,
    ),
  ).toBe(false);
  await game.getByRole("tab", { name: "Table", exact: true }).click();
  await page.clock.fastForward(800);
  expect(
    await game.evaluate((element) => (element as unknown as { game: ShitheadState }).game),
  ).not.toEqual(before);
  await game.getByRole("tab", { name: "Options", exact: true }).click();
  await game.getByRole("button", { name: "Apply options and deal new game", exact: true }).click();
  await expect(game.getByRole("button", { name: "Start game", exact: true })).toBeVisible();
  expect(
    await game.evaluate((element) => (element as unknown as { game: ShitheadState }).game.rules),
  ).toEqual({ ...rules, voluntaryPickup: true });
  await game.getByRole("tab", { name: "Options", exact: true }).click();
  await expect(two).toBeChecked();
  await expect(reveal).toBeChecked();
});

test("rule controls prevent voluntary pickup and reveal the exact card below a played 2", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("combobox", { name: "Game", exact: true }).selectOption("shithead");
  const game = page.locator("shithead-game");
  await game.getByRole("tab", { name: "Options", exact: true }).click();
  await game.getByRole("checkbox", { name: "Allow voluntary pile pickup", exact: true }).uncheck();
  await game.getByRole("checkbox", { name: "Play again after a 2", exact: true }).check();
  await game.getByRole("checkbox", { name: "Reveal the card underneath", exact: true }).check();
  await game.getByRole("tab", { name: "Table", exact: true }).click();
  await page.clock.install();
  await game.evaluate((element) => {
    const component = element as unknown as { game: ShitheadState };
    component.game = {
      ...component.game,
      phase: "playing",
      turn: 0,
      stock: [],
      pile: [{ rank: "A", suit: "Hearts" }],
      players: [
        {
          hand: [],
          faceUp: [
            { rank: "5", suit: "Clubs" },
            { rank: "2", suit: "Clubs" },
          ],
          faceDown: [
            { rank: "J", suit: "Clubs" },
            { rank: "Q", suit: "Clubs" },
          ],
        },
        component.game.players[1],
      ],
    };
  });
  await expect(game.getByRole("button", { name: "Pick up pile", exact: true })).toBeDisabled();
  await expect(game.getByRole("button", { name: "Play 5 of Clubs", exact: true })).toBeDisabled();
  await game.getByRole("button", { name: "Play 2 of Clubs", exact: true }).click();
  await expect(game.getByRole("status")).toContainText("Play again.");
  await expect(game.getByRole("button", { name: "Play Q of Clubs", exact: true })).toBeEnabled();
  const down = game.locator(".your-table");
  await expect(
    down.getByRole("button", { name: "Reveal face-down card 1", exact: true }),
  ).toHaveCount(1);
  await expect(
    down.getByRole("button", { name: "Reveal face-down card 2", exact: true }),
  ).toHaveCount(0);
  expect(await down.innerHTML()).not.toContain("J-Clubs");
});

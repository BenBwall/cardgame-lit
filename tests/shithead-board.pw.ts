import { expect, test, type Page } from "@playwright/test";
import { type ShitheadState, DEFAULT_SHITHEAD_RULES } from "../src/shithead-state.js";

const fixture = (): ShitheadState => ({
  rules: { ...DEFAULT_SHITHEAD_RULES, playAgainAfterTwo: true },
  phase: "playing",
  turn: 0,
  winner: null,
  message: "Your turn.",
  stock: [
    { rank: "Q", suit: "Hearts" },
    { rank: "K", suit: "Hearts" },
  ],
  pile: [{ rank: "8", suit: "Diamonds" }],
  burned: [],
  players: [
    {
      hand: [
        { rank: "2", suit: "Clubs" },
        { rank: "7", suit: "Clubs" },
        { rank: "9", suit: "Clubs" },
      ],
      faceUp: [{ rank: "10", suit: "Hearts" }],
      faceDown: [{ rank: "3", suit: "Hearts" }],
    },
    {
      hand: [{ rank: "4", suit: "Spades" }],
      faceUp: [{ rank: "5", suit: "Spades" }],
      faceDown: [{ rank: "6", suit: "Spades" }],
    },
  ],
});
const game = (page: Page) => page.locator("shithead-game");
const idle = async (page: Page) => {
  await expect
    .poll(() => game(page).evaluate((node) => (node as unknown as { busy: boolean }).busy))
    .toBe(false);
  await expect(game(page).locator(".board-flight")).toHaveCount(0);
  await expect(game(page).locator("[data-board-arriving]")).toHaveCount(0);
};
const setState = async (page: Page, state: ShitheadState) => {
  await game(page).evaluate((node, state) => {
    (node as unknown as { game: ShitheadState }).game = state;
  }, state);
};
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 1500 });
  await page.goto("/");
  await page.getByRole("combobox", { name: "Game", exact: true }).selectOption("shithead");
});

test("hand shares fan/grid layout, sorting, keyboard and mouse reordering with free play", async ({
  page,
}) => {
  const hand = game(page).locator(".hand");
  await expect(game(page).getByRole("button", { name: "Fan layout", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(hand).toHaveAttribute("data-layout", "fan");
  await game(page).getByRole("button", { name: "Grid layout", exact: true }).click();
  await expect(game(page).locator(".board-flight")).toHaveCount(0);
  const order = () =>
    hand
      .locator("button")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-card-id")));
  const original = await order();
  await hand.locator("button").first().focus();
  await page.keyboard.press("Alt+End");
  await expect.poll(order).toEqual([...original.slice(1), original[0]]);
  await expect(game(page).getByRole("combobox", { name: "Sort", exact: true })).toHaveValue(
    "manual",
  );
  await game(page).getByRole("combobox", { name: "Sort", exact: true }).selectOption("draw-order");
  await expect.poll(order).toEqual(original);
  await expect(game(page).locator(".board-flight")).toHaveCount(0);
  await hand.scrollIntoViewIfNeeded();
  const first = (await hand.locator("button").first().boundingBox())!,
    last = (await hand.locator("button").last().boundingBox())!;
  await page.mouse.move(first.x + 20, first.y + 25);
  await page.mouse.down();
  await page.mouse.move(last.x + last.width - 8, last.y + 25, { steps: 12 });
  await expect(game(page).locator(".drag-preview")).toHaveCount(1);
  await page.mouse.up();
  await expect.poll(order).toEqual([...original.slice(1), original[0]]);
  await expect(game(page).locator(".drag-preview")).toHaveCount(0);
  await expect(game(page).locator(".board-flight")).toHaveCount(0);
  await game(page)
    .getByRole("combobox", { name: "Sort", exact: true })
    .selectOption("rank-then-suit");
  await game(page).getByRole("combobox", { name: "Sort", exact: true }).selectOption("manual");
  await expect.poll(order).toEqual([...original.slice(1), original[0]]);
  expect(
    await game(page).evaluate((node) => (node as unknown as { game: ShitheadState }).game.phase),
  ).toBe("setup");
});

test("click-to-play flies to pile and refills from stock with the chosen flip direction", async ({
  page,
}) => {
  await setState(page, fixture());
  await game(page).getByRole("button", { name: "Left to right", exact: true }).click();
  await game(page).getByRole("button", { name: "Play 2 of Clubs", exact: true }).click();
  await expect.poll(() => game(page).locator(".board-flight").count()).toBeGreaterThan(0);
  const flips = game(page).locator('.board-flight[data-flight-kind="flip"]');
  await expect(flips).toHaveCount(1);
  await expect(flips.locator(".flight-flipper")).toHaveAttribute("data-flip-axis", "Y");
  const frames = await flips
    .locator(".flight-flipper")
    .evaluate((node) => (node.getAnimations()[0].effect as KeyframeEffect).getKeyframes());
  expect(frames[0].transform).toBe("rotateY(-180deg)");
  expect(frames.at(-1)?.transform).toBe("rotateY(0deg)");
  await idle(page);
  await expect(
    game(page).getByRole("heading", { name: "Your hand (3)", exact: true }),
  ).toBeVisible();
  await expect(
    game(page).getByRole("button", { name: "Play K of Hearts", exact: true }),
  ).toBeEnabled();
  expect(
    await game(page)
      .getByRole("status")
      .evaluate((node) => getComputedStyle(node).clipPath),
  ).toBe("inset(50%)");
  const covered = game(page).locator(".lower-card, .opponent-hand");
  expect(
    await covered.evaluateAll((nodes) => nodes.map((node) => node.innerHTML).join("")),
  ).not.toMatch(/Hearts|Spades|Clubs|Diamonds|data-suit/);
});

test("burns sweep cards out and switching to Options cancels every flight", async ({ page }) => {
  const state = fixture();
  await setState(page, {
    ...state,
    stock: [],
    players: [
      {
        ...state.players[0],
        hand: [
          { rank: "10", suit: "Clubs" },
          { rank: "9", suit: "Clubs" },
        ],
      },
      state.players[1],
    ],
  });
  await game(page).getByRole("button", { name: "Play 10 of Clubs", exact: true }).click();
  await expect
    .poll(() => game(page).locator('.board-flight[data-flight-kind="burn"]').count())
    .toBeGreaterThan(0);
  await game(page).getByRole("tab", { name: "Options", exact: true }).click();
  await idle(page);
  await game(page).getByRole("tab", { name: "Table", exact: true }).click();
  await expect(game(page).getByRole("img", { name: "Burned: 2 cards", exact: true })).toBeVisible();
  await expect(
    game(page).getByRole("button", { name: "Play 9 of Clubs", exact: true }),
  ).toBeEnabled();
});

test("blind failure flips at the pile before pickup; reduced motion clears flights", async ({
  page,
}) => {
  const state = fixture();
  await setState(page, {
    ...state,
    stock: [],
    players: [
      { hand: [], faceUp: [], faceDown: [{ rank: "3", suit: "Hearts" }] },
      state.players[1],
    ],
  });
  await game(page).getByRole("button", { name: "Reveal face-down card 1", exact: true }).click();
  await expect
    .poll(() => game(page).locator('.board-flight[data-flight-kind="flip"]').count())
    .toBeGreaterThan(0);
  await expect(game(page).locator(".hand [data-board-arriving]")).toHaveCount(2);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await idle(page);
  await expect(
    game(page).getByRole("heading", { name: "Your hand (2)", exact: true }),
  ).toBeVisible();
  await game(page).getByRole("tab", { name: "Options", exact: true }).click();
  await setState(page, fixture());
  await game(page).getByRole("tab", { name: "Table", exact: true }).click();
  await game(page).getByRole("button", { name: "Play 2 of Clubs", exact: true }).click();
  await idle(page);
});

test("table and large hands fit narrow screens in both layouts and themes", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const state = await game(page).evaluate(
    (node) => (node as unknown as { game: ShitheadState }).game,
  );
  await setState(page, {
    ...state,
    stock: [],
    players: [
      { ...state.players[0], hand: [...state.players[0].hand, ...state.stock] },
      state.players[1],
    ],
  });
  for (const layout of ["Grid layout", "Fan layout"]) {
    await game(page).getByRole("button", { name: layout, exact: true }).click();
    for (const colorScheme of ["light", "dark"] as const)
      for (const width of [320, 390, 768, 1440]) {
        await page.emulateMedia({ colorScheme });
        await page.setViewportSize({ width, height: 1200 });
        await expect
          .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
          .toBe(true);
      }
  }
});

test("pickups and burns finish naturally with no hidden or duplicate cards", async ({ page }) => {
  const state = fixture();
  await setState(page, { ...state, stock: [] });
  await game(page).getByRole("button", { name: "Pick up pile", exact: true }).click();
  await expect.poll(() => game(page).locator(".board-flight").count()).toBeGreaterThan(0);
  await idle(page);
  await expect(game(page).locator(".hand button")).toHaveCount(4);
  await setState(page, {
    ...state,
    stock: [],
    players: [
      {
        ...state.players[0],
        hand: [
          { rank: "10", suit: "Clubs" },
          { rank: "9", suit: "Clubs" },
        ],
      },
      state.players[1],
    ],
  });
  await game(page).getByRole("button", { name: "Play 10 of Clubs", exact: true }).click();
  await expect
    .poll(() => game(page).locator('.board-flight[data-flight-kind="burn"]').count())
    .toBeGreaterThan(0);
  await idle(page);
  await expect(game(page).locator(".hand button")).toHaveCount(1);
  await expect(
    game(page).getByRole("button", { name: "Play 9 of Clubs", exact: true }),
  ).toBeVisible();
  await expect(game(page).locator(".pile-card")).toHaveCount(0);
  expect(
    await game(page).evaluate(
      (node) => (node as unknown as { game: ShitheadState }).game.burned.length,
    ),
  ).toBe(2);
});

import { expect, test, type Page } from "@playwright/test";
import { createDeck, cardId, type Card } from "../src/cards.js";
import { DEFAULT_SHITHEAD_RULES, type ShitheadState } from "../src/shithead-state.js";

const c = (rank: Card["rank"], suit: Card["suit"] = "Clubs"): Card => ({ rank, suit });
const fullState = (): ShitheadState => {
  const players: ShitheadState["players"] = [
    {
      hand: [c("7"), c("7", "Hearts"), c("7", "Spades")],
      faceUp: [c("2"), c("Q"), c("K")],
      faceDown: [c("3", "Diamonds"), c("4", "Diamonds"), c("5", "Diamonds")],
    },
    {
      hand: [c("6", "Spades"), c("9", "Spades"), c("J", "Spades")],
      faceUp: [c("A", "Hearts"), c("10", "Hearts"), c("Q", "Hearts")],
      faceDown: [c("2", "Diamonds"), c("6", "Diamonds"), c("8", "Diamonds")],
    },
  ];
  const used = new Set(players.flatMap((p) => [...p.hand, ...p.faceUp, ...p.faceDown]).map(cardId));
  return {
    players,
    stock: [],
    pile: [],
    burned: createDeck().filter((card) => !used.has(cardId(card))),
    rules: { ...DEFAULT_SHITHEAD_RULES },
    phase: "playing",
    turn: 0,
    winner: null,
    message: "Your turn.",
  };
};
const game = (page: Page) => page.locator("shithead-game");
const state = (page: Page) =>
  game(page).evaluate((node) => (node as unknown as { game: ShitheadState }).game);
const setState = async (page: Page, value: ShitheadState) => {
  await game(page).evaluate((node, value) => {
    (node as unknown as { game: ShitheadState }).game = value;
  }, value);
  await expect.poll(() => state(page)).toEqual(value);
};
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install({ time: new Date("2026-09-14T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-09-14T12:00:01Z"));
  await page.goto("/");
});

test("matching ranks expose Select all and subsets remain selected across refresh", async ({
  page,
}) => {
  await page.getByRole("combobox", { name: "Game", exact: true }).selectOption("shithead");
  const initial = fullState();
  await setState(page, initial);
  await expect(
    game(page).getByRole("button", { name: "Select all 3 × 7", exact: true }),
  ).toBeVisible();
  await game(page).getByRole("button", { name: "Select 7 of Clubs", exact: true }).click();
  expect(await state(page)).toEqual(initial);
  await expect(
    game(page).getByRole("button", { name: "Play selected (1)", exact: true }),
  ).toBeEnabled();
  await expect(game(page).getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
  await game(page).getByRole("button", { name: "Select 7 of Hearts", exact: true }).click();
  await game(page).getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await state(page)).toEqual(initial);
  await expect(game(page).locator('.hand button[aria-pressed="true"]')).toHaveCount(0);
  await expect(game(page).getByRole("button", { name: /^Play selected/ })).toHaveCount(0);
  await game(page).getByRole("button", { name: "Select 7 of Clubs", exact: true }).click();
  await game(page).getByRole("button", { name: "Select 7 of Hearts", exact: true }).click();
  await game(page).getByRole("button", { name: "Select 7 of Hearts", exact: true }).click();
  await expect(
    game(page).getByRole("button", { name: "Play selected (1)", exact: true }),
  ).toBeEnabled();
  await game(page).getByRole("button", { name: "Select 7 of Hearts", exact: true }).click();
  await expect(
    game(page).getByRole("button", { name: "Play selected (2)", exact: true }),
  ).toBeEnabled();
  expect(await state(page)).toEqual(initial);
  await page.reload();
  await expect(
    game(page).getByRole("button", { name: "Play selected (2)", exact: true }),
  ).toBeEnabled();
  await game(page).getByRole("button", { name: "Play selected (2)", exact: true }).click();
  expect((await state(page)).pile.map(cardId)).toEqual(["7-Clubs", "7-Hearts"]);
  expect((await state(page)).players[0].hand.map(cardId)).toEqual(["7-Spades"]);
  await setState(page, initial);
  await game(page).getByRole("button", { name: "Select all 3 × 7", exact: true }).click();
  expect(await state(page)).toEqual(initial);
  await game(page).getByRole("button", { name: "Play selected (3)", exact: true }).click();
  expect((await state(page)).pile).toHaveLength(3);
  expect((await state(page)).players[0].hand).toHaveLength(0);
});

test("matching face-up cards play together and burn a fourth matching pile card", async ({
  page,
}) => {
  await page.getByRole("combobox", { name: "Game", exact: true }).selectOption("shithead");
  const initial = fullState();
  const player = initial.players[0];
  await setState(page, {
    ...initial,
    players: [{ ...player, hand: [], faceUp: player.hand }, initial.players[1]],
    pile: [c("7", "Diamonds")],
    burned: [...initial.burned.filter((card) => cardId(card) !== "7-Diamonds"), ...player.faceUp],
  });
  await game(page).getByRole("button", { name: "Select all 3 × 7", exact: true }).click();
  await game(page).getByRole("button", { name: "Play selected (3)", exact: true }).click();
  const after = await state(page);
  expect(after.players[0].faceUp).toHaveLength(0);
  expect(after.pile).toHaveLength(0);
  expect(after.burned.filter((card) => card.rank === "7")).toHaveLength(4);
  expect(after.turn).toBe(0);
  await page.reload();
  expect(await state(page)).toEqual(after);
});

test("mode, active deal, pending rules and every hand setting survive refresh and switching modes", async ({
  page,
}) => {
  await page.getByRole("combobox", { name: "Game", exact: true }).selectOption("shithead");
  const initial = fullState();
  await setState(page, initial);
  await game(page).getByRole("button", { name: "Grid layout", exact: true }).click();
  await game(page).getByRole("button", { name: "Left to right", exact: true }).click();
  await game(page).locator(".hand button").first().focus();
  await page.keyboard.press("Alt+End");
  const order = await game(page)
    .locator(".hand button")
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-card-id")));
  await game(page).getByRole("tab", { name: "Options", exact: true }).click();
  await game(page)
    .getByRole("checkbox", { name: "Allow voluntary pile pickup", exact: true })
    .uncheck();
  await game(page).getByRole("checkbox", { name: "Play again after a 2", exact: true }).check();
  await game(page)
    .getByRole("checkbox", { name: "Reveal the card underneath", exact: true })
    .check();
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Game", exact: true })).toHaveValue("shithead");
  await expect(game(page).getByRole("tab", { name: "Options", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    game(page).getByRole("checkbox", { name: "Allow voluntary pile pickup", exact: true }),
  ).not.toBeChecked();
  await expect(
    game(page).getByRole("checkbox", { name: "Play again after a 2", exact: true }),
  ).toBeChecked();
  await expect(
    game(page).getByRole("checkbox", { name: "Reveal the card underneath", exact: true }),
  ).toBeChecked();
  expect(await state(page)).toEqual(initial);
  await game(page).getByRole("tab", { name: "Table", exact: true }).click();
  await expect(
    game(page).getByRole("button", { name: "Grid layout", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    game(page).getByRole("button", { name: "Left to right", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(game(page).getByRole("combobox", { name: "Sort", exact: true })).toHaveValue(
    "manual",
  );
  expect(
    await game(page)
      .locator(".hand button")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-card-id"))),
  ).toEqual(order);
  await page.getByRole("combobox", { name: "Game", exact: true }).selectOption("free-play");
  await page.getByRole("combobox", { name: "Game", exact: true }).selectOption("shithead");
  expect(await state(page)).toEqual(initial);
});

test("a pending computer turn resumes once after refresh", async ({ page }) => {
  await page.getByRole("combobox", { name: "Game", exact: true }).selectOption("shithead");
  await setState(page, { ...fullState(), turn: 1 });
  await page.reload();
  await expect.poll(() => state(page).then((value) => value.turn)).toBe(1);
  await page.clock.runFor(700);
  await expect.poll(() => state(page).then((value) => value.turn)).toBe(0);
  const after = await state(page);
  expect(after.pile.map(cardId)).toEqual(["6-Spades"]);
  await page.reload();
  await page.clock.runFor(1400);
  expect(await state(page)).toEqual(after);
});

test("refresh during a flight restores its committed move without replaying it", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByRole("combobox", { name: "Game", exact: true }).selectOption("shithead");
  const initial = fullState();
  await setState(page, {
    ...initial,
    rules: { ...initial.rules, playAgainAfterTwo: true },
    players: [
      {
        ...initial.players[0],
        hand: [initial.players[0].faceUp[0], ...initial.players[0].hand.slice(1)],
        faceUp: [initial.players[0].hand[0], ...initial.players[0].faceUp.slice(1)],
      },
      initial.players[1],
    ],
  });
  await game(page).getByRole("button", { name: "Play 2 of Clubs", exact: true }).click();
  await expect.poll(() => game(page).locator(".board-flight").count()).toBeGreaterThan(0);
  const after = await state(page);
  await page.reload();
  expect(await state(page)).toEqual(after);
  await expect(game(page).locator(".board-flight, [data-board-arriving]")).toHaveCount(0);
});

test("free play restores its cards, settings and undo history", async ({ page }) => {
  const root = page.locator("card-game");
  await root.getByRole("button", { name: "Grid layout", exact: true }).click();
  for (let i = 0; i < 3; i++)
    await root.getByRole("button", { name: "Draw a card", exact: true }).click();
  await root.getByRole("button", { name: "Bottom to top", exact: true }).click();
  await root.getByRole("combobox", { name: "Sort", exact: true }).selectOption("suit-then-rank");
  const card = await root.locator(".hand button").first().getAttribute("aria-label");
  await root.locator(".hand button").first().click();
  await page.reload();
  await expect(root.getByRole("heading", { name: "Your hand (2)", exact: true })).toBeVisible();
  await expect(root.getByRole("button", { name: "Grid layout", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(root.getByRole("button", { name: "Bottom to top", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(root.getByRole("combobox", { name: "Sort", exact: true })).toHaveValue(
    "suit-then-rank",
  );
  await root.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(root.getByRole("button", { name: card!, exact: true })).toBeVisible();
  await expect(root.getByRole("heading", { name: "Your hand (3)", exact: true })).toBeVisible();
});

test("malformed saved data and unavailable storage do not break the game", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "cardgame:v1:/:table:0",
      '{"version":1,"data":{"game":{"hand":42},"mode":"bogus"}}',
    );
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your hand (0)", exact: true })).toBeVisible();
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new Error("Storage denied");
    };
  });
  await page.reload();
  await expect(
    page.getByText("Browser storage is unavailable. This game cannot be saved.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Draw a card", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your hand (1)", exact: true })).toBeVisible();
});

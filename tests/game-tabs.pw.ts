import { expect, test } from "@playwright/test";

test("game tabs and Shithead subtabs support keyboard navigation and preserve games", async ({
  page,
}) => {
  await page.goto("/");
  const gameTabs = page.getByRole("tablist", { name: "Game", exact: true });
  const free = gameTabs.getByRole("tab", { name: "Free play", exact: true });
  const shithead = gameTabs.getByRole("tab", { name: "Shithead", exact: true });
  await expect(free).toHaveAttribute("aria-selected", "true");
  await expect(shithead).toHaveAttribute("tabindex", "-1");
  await page.getByRole("button", { name: "Draw a card", exact: true }).click();
  await free.focus();
  await page.keyboard.press("ArrowRight");
  await expect(shithead).toBeFocused();
  await expect(shithead).toHaveAttribute("aria-selected", "true");
  const modes = page.getByRole("tablist", { name: "Shithead mode", exact: true });
  const single = modes.getByRole("tab", { name: "Single player", exact: true });
  const multi = modes.getByRole("tab", { name: "Multiplayer", exact: true });
  await expect(single).toHaveAttribute("aria-selected", "true");
  const hand = await page
    .locator("shithead-game .hand [data-card-id]")
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-card-id")));
  await single.focus();
  await page.keyboard.press("End");
  await expect(multi).toBeFocused();
  await expect(page.getByRole("tabpanel", { name: "Multiplayer", exact: true })).toBeVisible();
  await expect(page.getByRole("tabpanel", { name: "Single player", exact: true })).toBeHidden();
  await shithead.focus();
  await page.keyboard.press("Home");
  await expect(free).toBeFocused();
  await expect(page.getByRole("heading", { name: "Your hand (1)", exact: true })).toBeVisible();
  await page.keyboard.press("End");
  await expect(multi).toHaveAttribute("aria-selected", "true");
  await multi.focus();
  await page.keyboard.press("ArrowRight");
  await expect(single).toBeFocused();
  expect(
    await page
      .locator("shithead-game .hand [data-card-id]")
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-card-id"))),
  ).toEqual(hand);
  await expect(
    page.locator("shithead-game").getByRole("button", { name: "Start game", exact: true }),
  ).toBeVisible();
  await multi.click();
  await page.reload();
  await expect(shithead).toHaveAttribute("aria-selected", "true");
  await expect(multi).toHaveAttribute("aria-selected", "true");
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});

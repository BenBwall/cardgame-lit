import { expect, test } from "@playwright/test";

test("appearance side tab opens without moving the table and supports keyboard dismissal", async ({
  page,
}) => {
  await page.goto("/");
  const settings = page.locator("card-appearance");
  const trigger = settings.getByRole("button", { name: "Card appearance", exact: true });
  const panel = settings.getByRole("region", { name: "Card appearance settings" });
  const table = page.locator("card-game .game").first();
  await expect(panel).toBeHidden();
  expect(await settings.evaluate((element) => Boolean(element.closest(".game")))).toBe(false);
  await expect(trigger).toHaveCSS("writing-mode", "vertical-rl");
  const before = await table.boundingBox();
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(panel).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(settings.getByRole("button", { name: "Close card appearance" })).toBeFocused();
  expect(await table.boundingBox()).toEqual(before);
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click();
  await trigger.click();
  await expect(panel).toBeHidden();
  await trigger.click();
  await settings.getByRole("button", { name: "Close card appearance" }).click();
  await expect(panel).toBeHidden();
  await trigger.click();
  await page.getByRole("heading", { name: "Card game", exact: true }).click();
  await expect(panel).toBeHidden();
});

test("appearance popout fits small screens and keeps all settings reachable", async ({ page }) => {
  await page.goto("/");
  const settings = page.locator("card-appearance");
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 600 });
    await settings.getByRole("button", { name: "Card appearance", exact: true }).click();
    const panel = settings.getByRole("region", { name: "Card appearance settings" });
    const bounds = (await panel.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(600);
    expect(await panel.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    await settings.getByRole("link", { name: "Kenney", exact: true }).scrollIntoViewIfNeeded();
    await expect(settings.getByRole("link", { name: "Kenney", exact: true })).toBeInViewport();
    await page.keyboard.press("Escape");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});

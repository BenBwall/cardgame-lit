import { expect, test, type Page } from "@playwright/test";

const hand = (page: Page) => page.locator(".hand button");
const flights = (page: Page) => page.locator(".card-flight");
const settled = (page: Page) => expect(flights(page)).toHaveCount(0);
const draw = async (page: Page, count = 1) => {
  await page.goto("/");
  for (let i = 0; i < count; i++) await page.getByRole("button", { name: "Draw a card" }).click();
};

test("a draw flies from the deck, rotates in transit, and lands without duplicate faces", async ({
  page,
}) => {
  await draw(page);
  const flight = flights(page);
  await expect(flight).toHaveAttribute("data-flight-kind", "draw");
  const deck = (await page.locator("#draw-card").boundingBox())!;
  const target = (await hand(page).first().boundingBox())!;
  const samples = await flight.evaluate((node) => {
    const animation = node.getAnimations()[0];
    animation.pause();
    const duration = Number(animation.effect!.getTiming().duration);
    return [0, duration / 2, duration].map((time) => {
      animation.currentTime = time;
      const m = new DOMMatrix(getComputedStyle(node).transform);
      return { x: m.e, y: m.f, angle: (Math.atan2(m.b, m.a) * 180) / Math.PI };
    });
  });
  expect(samples[0].x).toBeCloseTo(deck.x, 0);
  expect(samples[0].y).toBeCloseTo(deck.y, 0);
  expect(Math.abs(samples[1].angle)).toBeGreaterThan(2);
  expect(samples[1].y).toBeGreaterThan(deck.y);
  expect(samples[1].y).toBeLessThan(target.y);
  expect(samples[2].x).toBeCloseTo(target.x, 0);
  expect(samples[2].y).toBeCloseTo(target.y, 0);
  expect(samples[2].angle).toBeCloseTo(0);
  await expect(hand(page).first()).toHaveCSS("opacity", "0");
  await flight.evaluate((node) => node.getAnimations()[0].finish());
  await settled(page);
  await expect(hand(page).first()).toHaveCSS("opacity", "1");
});

test("an invalid drop flies back from its dragged angle without changing hand order or history", async ({
  page,
}) => {
  await draw(page, 4);
  await settled(page);
  const original = await hand(page).evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-card-id")),
  );
  const card = hand(page).first();
  const rect = (await card.boundingBox())!;
  await page.mouse.move(rect.x + 12, rect.y + 18);
  await page.mouse.down();
  await page.mouse.move(700, rect.y - 100, { steps: 15 });
  await page.waitForTimeout(100);
  await page.mouse.up();
  const flight = page.locator('[data-flight-kind="land"]');
  await expect(flight).toHaveCount(1);
  const frames = await flight.evaluate((node) => {
    const animation = node.getAnimations()[0];
    animation.pause();
    return (animation.effect as KeyframeEffect)
      .getKeyframes()
      .map((frame) => String(frame.transform));
  });
  expect(frames[0]).not.toContain("rotate(0deg)");
  expect(frames.at(-1)).toContain("rotate(0deg)");
  expect(
    await hand(page).evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-card-id"))),
  ).toEqual(original);
  await expect(card).toHaveAttribute("data-in-flight", "");
  await flight.evaluate((node) => node.getAnimations()[0].finish());
  await settled(page);
  await expect(card).not.toHaveAttribute("data-in-flight", "");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(hand(page)).toHaveCount(3);
  await expect(page.locator('[data-flight-kind="return-deck"]')).toHaveCount(1);
});

test("playing, undo, reordering, sorting, and resetting animate their card movements", async ({
  page,
}) => {
  await draw(page, 5);
  await settled(page);
  await hand(page).first().click();
  await expect(page.locator('[data-flight-kind="play"]')).toHaveCount(1);
  await settled(page);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator('[data-flight-kind="play"]')).toHaveCount(1);
  await settled(page);
  await hand(page).first().focus();
  await page.keyboard.press("Alt+End");
  await expect(page.locator('[data-flight-kind="arrange"]')).not.toHaveCount(0);
  await settled(page);
  await page.getByRole("combobox", { name: "Sort", exact: true }).selectOption("draw-order");
  await expect(page.locator('[data-flight-kind="arrange"]')).not.toHaveCount(0);
  await settled(page);
  await page.getByRole("button", { name: "New deck", exact: true }).click();
  await page.getByRole("button", { name: "Shuffle new deck", exact: true }).click();
  await expect(hand(page)).toHaveCount(0);
  await expect(page.locator('[data-flight-kind="return-deck"]')).toHaveCount(5);
  await settled(page);
  await expect(page.locator("[data-in-flight]")).toHaveCount(0);
});

test("rapid draws and undo, reduced motion changes, and removal clean up active flights", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await draw(page, 6);
  await expect(hand(page)).toHaveCount(6);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(hand(page)).toHaveCount(5);
  await expect(page.locator('[data-flight-kind="return-deck"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Draw a card" }).click();
  await expect(hand(page)).toHaveCount(6);
  await settled(page);
  await expect(page.locator("[data-in-flight]")).toHaveCount(0);
  await page.getByRole("button", { name: "Draw a card" }).click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await settled(page);
  await page.getByRole("button", { name: "Draw a card" }).click();
  await expect(hand(page)).toHaveCount(8);
  await settled(page);
  await expect(page.locator("[data-in-flight]")).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByRole("button", { name: "Draw a card" }).click();
  const leftovers = await page.locator("card-game").evaluate((node) => {
    node.remove();
    return node.shadowRoot!.querySelectorAll(".card-flight, [data-in-flight]").length;
  });
  expect(leftovers).toBe(0);
  expect(errors).toEqual([]);
});

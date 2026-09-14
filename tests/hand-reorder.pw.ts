import { expect, test, type Locator, type Page } from "@playwright/test";

const cards = (page: Page) => page.locator("card-game .hand button");
const order = (page: Page) =>
  cards(page).evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-card-id")));
const box = async (locator: Locator) => {
  const result = await locator.boundingBox();
  if (!result) throw new Error("Card is not visible");
  return result;
};
const draw = async (page: Page, count = 5) => {
  await page.goto("/");
  for (let index = 0; index < count; index++)
    await page.getByRole("button", { name: "Draw a card" }).click();
};
const beginDrag = async (page: Page, source: Locator) => {
  await source.scrollIntoViewIfNeeded();
  const rect = await box(source);
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width / 2 + 10, rect.y + rect.height / 2, { steps: 3 });
};
const grabAt = async (page: Page, source: Locator, gripX: number, gripY: number) => {
  await source.scrollIntoViewIfNeeded();
  await source.hover();
  // Measure after the hover lift so the intended grab point is exact.
  await page.waitForTimeout(150);
  const rect = await box(source);
  const x = rect.x + rect.width * gripX;
  const y = rect.y + rect.height * gripY;
  await page.mouse.move(x, y);
  await page.mouse.down();
  return { x, y };
};
const drag = async (page: Page, source: Locator, target: Locator, after = true) => {
  await beginDrag(page, source);
  const rect = await box(target);
  await page.mouse.move(rect.x + rect.width * (after ? 0.8 : 0.2), rect.y + rect.height / 2, {
    steps: 8,
  });
  await expect(page.locator("[data-drop-side]")).toHaveCount(1);
  await page.mouse.up();
};

test("mouse drag reorders both directions without playing and undo restores the order", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await draw(page);
  const original = await order(page);
  await drag(page, cards(page).first(), cards(page).last());
  await expect(cards(page)).toHaveCount(5);
  expect(await order(page)).toEqual([...original.slice(1), original[0]]);
  await expect(page.getByRole("combobox", { name: "Sort", exact: true })).toHaveValue("manual");
  await expect(cards(page).last()).toBeFocused();
  await expect(page.locator(".drag-preview")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(await order(page)).toEqual(original);
  await expect(page.getByRole("combobox", { name: "Sort", exact: true })).toHaveValue("draw-order");
  await drag(page, cards(page).last(), cards(page).first(), false);
  expect(await order(page)).toEqual([original[4], ...original.slice(0, 4)]);
  await cards(page).first().click();
  await expect(cards(page)).toHaveCount(4);
  expect(errors).toEqual([]);
});

test("dragging a sorted hand keeps its visible order and preserves the original draw order", async ({
  page,
}) => {
  await draw(page, 7);
  const original = await order(page);
  const sort = page.getByRole("combobox", { name: "Sort", exact: true });
  await sort.selectOption("rank-then-suit");
  const sorted = await order(page);
  await drag(page, cards(page).first(), cards(page).last());
  expect(await order(page)).toEqual([...sorted.slice(1), sorted[0]]);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(await order(page)).toEqual(sorted);
  await expect(sort).toHaveValue("rank-then-suit");
  await drag(page, cards(page).first(), cards(page).last());
  await page.getByRole("button", { name: "Draw a card" }).click();
  expect((await order(page)).slice(0, 7)).toEqual([...sorted.slice(1), sorted[0]]);
  await sort.selectOption("draw-order");
  expect((await order(page)).slice(0, 7)).toEqual(original);
});

test("outside drops, Escape, and pointer cancellation leave the hand untouched", async ({
  page,
}) => {
  await draw(page);
  const original = await order(page);
  await beginDrag(page, cards(page).first());
  await page.mouse.move(5, 5);
  await page.mouse.up();
  expect(await order(page)).toEqual(original);
  await beginDrag(page, cards(page).first());
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect(await order(page)).toEqual(original);
  await expect(page.locator(".drag-preview")).toHaveCount(0);
  await beginDrag(page, cards(page).first());
  await cards(page).first().dispatchEvent("pointercancel", { pointerId: 1 });
  await page.mouse.up();
  expect(await order(page)).toEqual(original);
  await expect(page.locator(".drag-preview")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(cards(page)).toHaveCount(4); // Only drawing entered history.
});

test("keyboard reordering preserves focus and Enter still plays", async ({ page }) => {
  await draw(page);
  const original = await order(page);
  await cards(page).first().focus();
  await page.keyboard.press("Alt+ArrowRight");
  expect(await order(page)).toEqual([original[1], original[0], ...original.slice(2)]);
  await expect(cards(page).nth(1)).toBeFocused();
  await page.keyboard.press("Alt+End");
  await expect(cards(page).last()).toBeFocused();
  await page.keyboard.press("Alt+Home");
  expect(await order(page)).toEqual(original);
  await page.keyboard.press("Enter");
  await expect(cards(page)).toHaveCount(4);
});

test("drag preview leans in both directions and settles while the pointer is held still", async ({
  page,
}) => {
  await draw(page);
  const original = await order(page);
  const source = cards(page).nth(2);
  const { x, y } = await grabAt(page, source, 0.5, 0.2);
  const angle = () =>
    page.locator(".drag-preview").evaluate((node) => {
      const matrix = new DOMMatrix(getComputedStyle(node).transform);
      return (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI;
    });
  for (let step = 1; step <= 16; step++) {
    await page.mouse.move(x + step * 5, y);
    await page.waitForTimeout(16);
  }
  expect(await angle()).toBeGreaterThan(3);
  for (let step = 1; step <= 24; step++) {
    await page.mouse.move(x + 80 - step * 5, y);
    await page.waitForTimeout(16);
  }
  expect(await angle()).toBeLessThan(-3);
  await expect.poll(async () => Math.abs(await angle())).toBeLessThan(0.2);
  expect(await order(page)).toEqual(original);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.locator(".drag-preview")).toHaveCount(0);
});

test("grab position controls rotation for horizontal, vertical, and diagonal pulls", async ({
  page,
}) => {
  await draw(page);
  const original = await order(page);
  const cases = [
    { gripX: 0.5, gripY: 0.2, dx: 5, dy: 0, sign: 1 },
    { gripX: 0.5, gripY: 0.8, dx: 5, dy: 0, sign: -1 },
    { gripX: 0.2, gripY: 0.5, dx: 0, dy: 5, sign: -1 },
    { gripX: 0.8, gripY: 0.5, dx: 0, dy: 5, sign: 1 },
    { gripX: 0.2, gripY: 0.2, dx: 5, dy: -5, sign: 1 },
    { gripX: 0.5, gripY: 0.5, dx: 5, dy: 5, sign: 0 },
  ];
  for (const { gripX, gripY, dx, dy, sign } of cases) {
    const { x, y } = await grabAt(page, cards(page).nth(2), gripX, gripY);
    for (let step = 1; step <= 20; step++) {
      await page.mouse.move(x + step * dx, y + step * dy);
      await page.waitForTimeout(16);
    }
    const angle = await page.locator(".drag-preview").evaluate((node) => {
      const matrix = new DOMMatrix(getComputedStyle(node).transform);
      return (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI;
    });
    if (sign === 0) expect(Math.abs(angle)).toBeLessThan(0.2);
    else expect(angle * sign).toBeGreaterThan(3);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(page.locator(".drag-preview")).toHaveCount(0);
    expect(await order(page)).toEqual(original);
  }
});

test("reduced motion keeps the preview upright and attached to the pointer", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await draw(page);
  const source = cards(page).first();
  await beginDrag(page, source);
  const rect = await box(cards(page).last());
  const x = rect.x + rect.width / 2;
  const y = rect.y + rect.height / 2;
  await page.mouse.move(x, y, { steps: 8 });
  await expect
    .poll(() =>
      page.locator(".drag-preview").evaluate((node) => {
        const matrix = new DOMMatrix(getComputedStyle(node).transform);
        return matrix.b;
      }),
    )
    .toBe(0);
  await expect
    .poll(async () => {
      const preview = await box(page.locator(".drag-preview"));
      return Math.abs(preview.x + preview.width / 2 - x);
    })
    .toBeLessThan(1);
  await page.mouse.up();
  await expect(cards(page)).toHaveCount(5);
  await expect(page.locator(".drag-preview")).toHaveCount(0);
});

test("real touch input reorders across wrapped rows and tapping still plays", async ({
  browser,
}) => {
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 1000 },
  });
  const page = await context.newPage();
  await draw(page, 8);
  await cards(page).first().tap();
  await expect(cards(page)).toHaveCount(7);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(cards(page)).toHaveCount(8);
  const original = await order(page);
  const session = await context.newCDPSession(page);
  const source = await box(cards(page).first());
  const target = await box(cards(page).last());
  const x = source.x + source.width / 2;
  const y = source.y + source.height / 2;
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let step = 1; step <= 8; step++) {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x: x + ((target.x + target.width * 0.8 - x) * step) / 8,
          y: y + ((target.y + target.height / 2 - y) * step) / 8,
        },
      ],
    });
  }
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  expect(await order(page)).toEqual([...original.slice(1), original[0]]);
  await expect(cards(page)).toHaveCount(8);
  await cards(page).first().tap();
  await expect(cards(page)).toHaveCount(7);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await context.close();
});

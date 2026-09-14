import { expect, test, type Locator, type Page } from "@playwright/test";

const cards = (page: Page) => page.locator(".hand button");
const settled = (page: Page) => expect(page.locator(".card-flight")).toHaveCount(0);
const order = (page: Page) =>
  cards(page).evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-card-id")));
const draw = async (page: Page, count = 7) => {
  await page.goto("/");
  for (let i = 0; i < count; i++) await page.getByRole("button", { name: "Draw a card" }).click();
  await settled(page);
};

// Pick an exposed point on the real rotated card, rather than its bounding-box centre.
const point = (card: Locator, x = 8, y = 16) =>
  card.evaluate(
    (node, { x, y }) => {
      const style = getComputedStyle(node);
      const matrix = new DOMMatrix(style.transform);
      const [ox, oy] = style.transformOrigin.split(" ").map(parseFloat);
      const width = parseFloat(style.width),
        height = parseFloat(style.height);
      const corners = [
        [0, 0],
        [width, 0],
        [0, height],
        [width, height],
      ].map(([x, y]) => ({
        x: matrix.a * (x - ox) + matrix.c * (y - oy) + ox,
        y: matrix.b * (x - ox) + matrix.d * (y - oy) + oy,
      }));
      const rect = node.getBoundingClientRect();
      return {
        x:
          rect.left -
          Math.min(...corners.map((p) => p.x)) +
          matrix.a * (x - ox) +
          matrix.c * (y - oy) +
          ox,
        y:
          rect.top -
          Math.min(...corners.map((p) => p.y)) +
          matrix.b * (x - ox) +
          matrix.d * (y - oy) +
          oy,
      };
    },
    { x, y },
  );

test("fan is the default and icon controls explain both layouts on hover and focus", async ({
  page,
}) => {
  await draw(page);
  const fan = page.getByRole("button", { name: "Fan layout", exact: true });
  const grid = page.getByRole("button", { name: "Grid layout", exact: true });
  await expect(fan).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".hand")).toHaveAttribute("data-layout", "fan");
  await fan.hover();
  await expect(fan.getByRole("tooltip")).toHaveText("Fan layout");
  await fan.focus();
  await page.keyboard.press("Tab");
  await expect(grid).toBeFocused();
  await expect(grid.getByRole("tooltip")).toBeVisible();
  const geometry = await cards(page).evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { x: rect.x, y: rect.y, angle: Number((node as HTMLElement).dataset.restAngle) };
    }),
  );
  expect(geometry[0].angle).toBeLessThan(0);
  expect(geometry.at(-1)!.angle).toBeGreaterThan(0);
  expect(geometry[3].y).toBeLessThan(geometry[0].y);
  const before = await order(page);
  await grid.click();
  await settled(page);
  await expect(grid).toHaveAttribute("aria-pressed", "true");
  expect(
    await cards(page).evaluateAll((nodes) =>
      nodes.every((node) => Number((node as HTMLElement).dataset.restAngle) === 0),
    ),
  ).toBe(true);
  expect(await order(page)).toEqual(before);
  await fan.click();
  await settled(page);
  expect(await order(page)).toEqual(before);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(cards(page)).toHaveCount(6);
  await expect(fan).toHaveAttribute("aria-pressed", "true");
});

test("expanding a fan and switching layout preserve active drawing clocks and flips", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.locator("card-game").evaluate(async (host) => {
    const root = host.shadowRoot!;
    const update = () =>
      (host as HTMLElement & { updateComplete: Promise<boolean> }).updateComplete;
    root.querySelector<HTMLButtonElement>("#draw-card")!.click();
    await update();
    const first = root.querySelector<HTMLElement>(".hand button")!;
    const animations = first.getAnimations({ subtree: true });
    for (const animation of animations) {
      animation.pause();
      animation.currentTime = 220;
    }
    const flip = first.querySelector(".flight-flipper")!.getAnimations()[0];
    const frames = JSON.stringify((flip.effect as KeyframeEffect).getKeyframes());
    const rect = first.getBoundingClientRect();
    for (let i = 0; i < 5; i++) {
      root.querySelector<HTMLButtonElement>("#draw-card")!.click();
      await update();
    }
    root.querySelector<HTMLButtonElement>('[aria-label="Grid layout"]')!.click();
    await update();
    const after = first.getBoundingClientRect();
    return {
      sameAnimations: animations.every((a) => first.getAnimations({ subtree: true }).includes(a)),
      sameTime: animations.every((a) => a.currentTime === 220),
      sameFlip: JSON.stringify((flip.effect as KeyframeEffect).getKeyframes()) === frames,
      distance: Math.hypot(rect.x - after.x, rect.y - after.y),
    };
  });
  expect(result.sameAnimations).toBe(true);
  expect(result.sameTime).toBe(true);
  expect(result.sameFlip).toBe(true);
  expect(result.distance).toBeLessThan(0.1);
});

test("tilted cards can be dragged to reorder, undone, and returned after an invalid drop", async ({
  page,
}) => {
  await draw(page);
  const original = await order(page);
  let start = await point(cards(page).first());
  await page.mouse.move(start.x, start.y);
  await page.waitForTimeout(150);
  start = await point(cards(page).first());
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 12, start.y, { steps: 3 });
  await expect(page.locator(".drag-preview")).toHaveCount(1);
  const target = await point(cards(page).last(), 62, 52);
  await page.mouse.move(target.x, target.y, { steps: 15 });
  await page.mouse.up();
  await settled(page);
  expect(await order(page)).toEqual([...original.slice(1), original[0]]);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await settled(page);
  expect(await order(page)).toEqual(original);
  start = await point(cards(page).first());
  await page.mouse.move(start.x, start.y);
  await page.waitForTimeout(150);
  start = await point(cards(page).first());
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x - 80, start.y - 150, { steps: 15 });
  await page.mouse.up();
  await settled(page);
  expect(await order(page)).toEqual(original);
  const angle = await cards(page)
    .first()
    .evaluate((node) => {
      const m = new DOMMatrix(getComputedStyle(node).transform);
      return (Math.atan2(m.b, m.a) * 180) / Math.PI;
    });
  expect(angle).toBeCloseTo(-24, 1);
});

test("a full fan hand fits narrow screens and both layouts respect reduced motion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await draw(page, 52);
  const geometry = await cards(page).evaluateAll((nodes) =>
    nodes.map((n) => n.getBoundingClientRect().toJSON()),
  );
  for (const card of geometry) {
    expect(card.left).toBeGreaterThanOrEqual(0);
    expect(card.right).toBeLessThanOrEqual(320);
  }
  expect(new Set(geometry.map((card) => Math.round(card.y / 168))).size).toBeGreaterThan(1);
  for (const name of ["Grid layout", "Fan layout"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await settled(page);
    await expect(cards(page)).toHaveCount(52);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});

test("fan cards land at their resting angles without a final pixel shift", async ({ page }) => {
  await page.goto("/");
  await page.locator("card-game").evaluate(async (host) => {
    const root = host.shadowRoot!;
    for (let i = 0; i < 7; i++) {
      root.querySelector<HTMLButtonElement>("#draw-card")!.click();
      await (host as HTMLElement & { updateComplete: Promise<boolean> }).updateComplete;
    }
    for (const node of root.querySelectorAll(".card-flight")) {
      for (const animation of node.getAnimations({ subtree: true })) {
        animation.pause();
        animation.currentTime = Number(animation.effect!.getTiming().duration);
      }
    }
  });
  const bounds = (await page.locator(".hand").boundingBox())!;
  const clip = {
    x: Math.floor(bounds.x),
    y: Math.floor(bounds.y),
    width: Math.ceil(bounds.width),
    height: Math.ceil(bounds.height),
  };
  await expect
    .poll(() => page.locator(".hand-region").evaluate((node) => node.getAnimations().length))
    .toBe(0);
  const before = await page.screenshot({ clip });
  await page.locator(".card-flight").evaluateAll((nodes) => {
    for (const node of nodes) node.getAnimations()[0].finish();
  });
  await settled(page);
  expect((await page.screenshot({ clip })).equals(before)).toBe(true);
});

test("a tilted fan supports native touch dragging and tapping", async ({
  browser,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "Native touch injection requires CDP.");
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 1100 },
  });
  const page = await context.newPage();
  await draw(page);
  const original = await order(page);
  const start = await point(cards(page).first());
  const end = await point(cards(page).last(), 62, 52);
  const session = await context.newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
  for (let step = 1; step <= 12; step++)
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x: start.x + ((end.x - start.x) * step) / 12,
          y: start.y + ((end.y - start.y) * step) / 12,
        },
      ],
    });
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await settled(page);
  expect(await order(page)).toEqual([...original.slice(1), original[0]]);
  const tap = await point(cards(page).first());
  await page.touchscreen.tap(tap.x, tap.y);
  await expect(cards(page)).toHaveCount(6);
  await context.close();
});

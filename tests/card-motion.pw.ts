import { expect, test, type Page } from "@playwright/test";

const hand = (page: Page) => page.locator(".hand button");
const flights = (page: Page) => page.locator(".card-flight");
const settled = (page: Page) => expect(flights(page)).toHaveCount(0);
const draw = async (page: Page, count = 1) => {
  await page.goto("/");
  for (let i = 0; i < count; i++) await page.getByRole("button", { name: "Draw a card" }).click();
};

test("a draw starts face down, flips vertically without spinning, and lands face up", async ({
  page,
}) => {
  await draw(page);
  const flight = flights(page);
  await expect(flight).toHaveAttribute("data-flight-kind", "draw");
  const deck = (await page.locator("#draw-card").boundingBox())!;
  const target = (await hand(page).first().boundingBox())!;
  const samples = await flight.evaluate((node) => {
    const animation = node.getAnimations()[0];
    const flipper = node.querySelector<HTMLElement>(".flight-flipper")!;
    const flip = flipper.getAnimations()[0];
    animation.pause();
    flip.pause();
    const duration = Number(animation.effect!.getTiming().duration);
    return [0, duration / 2, duration].map((time) => {
      animation.currentTime = time;
      flip.currentTime = time;
      const m = new DOMMatrix(getComputedStyle(node).transform);
      const facing = new DOMMatrix(getComputedStyle(flipper).transform);
      return {
        x: m.e,
        y: m.f,
        angle: (Math.atan2(m.b, m.a) * 180) / Math.PI,
        faceDirection: facing.m11,
      };
    });
  });
  expect(samples[0].x).toBeCloseTo(deck.x, 0);
  expect(samples[0].y).toBeCloseTo(deck.y, 0);
  expect(samples[0].faceDirection).toBeCloseTo(-1);
  expect(samples[1].faceDirection).toBeCloseTo(0);
  expect(samples[2].faceDirection).toBeCloseTo(1);
  for (const sample of samples) expect(sample.angle).toBeCloseTo(0);
  await expect(flight.locator(".flight-front")).toHaveCSS("backface-visibility", "hidden");
  await expect(flight.locator(".flight-back")).toHaveCSS("backface-visibility", "hidden");
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

test("undo continues an interrupted flip and returns the card face down", async ({ page }) => {
  await draw(page);
  const facing = await flights(page).evaluate((node) => {
    const flipper = node.querySelector<HTMLElement>(".flight-flipper")!;
    for (const animation of [...node.getAnimations(), ...flipper.getAnimations()]) {
      animation.pause();
      animation.currentTime = 200;
    }
    return new DOMMatrix(getComputedStyle(flipper).transform).m11;
  });
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  const returning = page.locator('[data-flight-kind="return-deck"]');
  const samples = await returning.evaluate((node) => {
    const flipper = node.querySelector<HTMLElement>(".flight-flipper")!;
    const animation = flipper.getAnimations()[0];
    animation.pause();
    return [0, Number(animation.effect!.getTiming().duration)].map((time) => {
      animation.currentTime = time;
      return new DOMMatrix(getComputedStyle(flipper).transform).m11;
    });
  });
  expect(samples[0]).toBeCloseTo(facing, 3);
  expect(samples[1]).toBeCloseTo(-1);
  await returning.evaluate((node) => node.getAnimations()[0].finish());
  await settled(page);
  await expect(hand(page)).toHaveCount(0);
});

test("interrupted draws preserve fractional card and text geometry at landing", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "17px";
  });
  const samples = await page.locator("card-game").evaluate(async (host) => {
    const root = host.shadowRoot!;
    for (let i = 0; i < 4; i++) {
      root.querySelector<HTMLButtonElement>("#draw-card")!.click();
      await (host as HTMLElement & { updateComplete: Promise<boolean> }).updateComplete;
      for (const node of root.querySelectorAll(".card-flight")) {
        for (const animation of node.getAnimations({ subtree: true })) {
          animation.pause();
          animation.currentTime = 100;
        }
      }
    }
    const geometry = (node: Element) =>
      [node, ...node.querySelectorAll(".rank, .suit")].map((part) => {
        const rect = part.getBoundingClientRect();
        return {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          font: getComputedStyle(part).font,
        };
      });
    return [...root.querySelectorAll<HTMLElement>(".card-flight")].map((node) => {
      for (const animation of node.getAnimations({ subtree: true }))
        animation.currentTime = Number(animation.effect!.getTiming().duration);
      const front = node.querySelector(".flight-front")!;
      const target = root.querySelector(`[data-card-id="${node.dataset.flightId}"]`)!;
      return {
        flight: geometry(front),
        target: geometry(target),
        shadow: getComputedStyle(front).boxShadow,
      };
    });
  });
  expect(samples).toHaveLength(4);
  for (const sample of samples) {
    expect(sample.shadow).toContain("rgba(0, 0, 0, 0)");
    sample.flight.forEach((part, index) => {
      const target = sample.target[index];
      expect(part.font).toBe(target.font);
      for (const dimension of ["x", "y", "width", "height"] as const)
        expect(part[dimension]).toBeCloseTo(target[dimension], 2);
    });
  }
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

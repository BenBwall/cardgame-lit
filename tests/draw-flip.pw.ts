import { expect, test } from "@playwright/test";

for (const [label, axis, sign] of [
  ["Top to bottom", "X", 1],
  ["Bottom to top", "X", -1],
  ["Left to right", "Y", -1],
  ["Right to left", "Y", 1],
] as const) {
  test(`${label} draw flips show the back, turn edge-on, and land face up`, async ({ page }) => {
    await page.goto("/");
    const control = page.getByRole("button", { name: label, exact: true });
    if (label === "Top to bottom") {
      await expect(control).toHaveAttribute("aria-pressed", "true");
      await expect(
        page.getByRole("group", { name: "Draw flip direction" }).getByRole("button").first(),
      ).toHaveAccessibleName("Top to bottom");
      const positions = await page
        .getByRole("group", { name: "Draw flip direction" })
        .getByRole("button")
        .evaluateAll((nodes) =>
          nodes.map((node) => {
            const box = node.getBoundingClientRect();
            return { x: box.x, y: box.y };
          }),
        );
      expect(positions[0].y).toBe(positions[1].y);
      expect(positions[2].y).toBe(positions[3].y);
      expect(positions[0].x).toBe(positions[2].x);
      expect(positions[1].x).toBe(positions[3].x);
      expect(positions[1].x).toBeGreaterThan(positions[0].x);
      expect(positions[2].y).toBeGreaterThan(positions[0].y);
    }
    await control.click();
    await expect(control).toHaveAttribute("aria-pressed", "true");
    await control.hover();
    await expect(control.getByRole("tooltip")).toBeVisible();
    await page.getByRole("button", { name: "Draw a card" }).click();
    const card = page.locator(".hand button").first();
    const samples = await card.evaluate((node, axis) => {
      const flipper = node.querySelector<HTMLElement>(".flight-flipper")!;
      const flip = flipper.getAnimations()[0];
      for (const animation of node.getAnimations({ subtree: true })) animation.pause();
      const duration = Number(flip.effect!.getTiming().duration);
      const samples = [0, 0.5, 1].map((progress) => {
        flip.currentTime = duration * progress;
        const matrix = new DOMMatrix(getComputedStyle(flipper).transform);
        const back = new DOMMatrix(
          getComputedStyle(flipper.querySelector(".flight-back")!).transform,
        );
        return {
          facing: axis === "X" ? matrix.m22 : matrix.m11,
          direction: axis === "X" ? matrix.m23 : -matrix.m13,
          fixedAxis: axis === "X" ? matrix.m11 : matrix.m22,
          back: axis === "X" ? back.m22 : back.m11,
        };
      });
      for (const animation of node.getAnimations({ subtree: true })) animation.finish();
      return samples;
    }, axis);
    expect(samples[1].direction).toBeCloseTo(sign);
    for (const [index, facing] of [-1, 0, 1].entries()) {
      expect(samples[index].facing).toBeCloseTo(facing);
      expect(samples[index].fixedAxis).toBeCloseTo(1);
      expect(samples[index].back).toBeCloseTo(-1);
    }
    await expect(page.locator(".card-flight")).toHaveCount(0);
    await expect(card).toBeVisible();
  });
}

test("changing flip direction leaves earlier flights intact and undo preserves their axis", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.locator("card-game").evaluate(async (host) => {
    const root = host.shadowRoot!;
    const update = () =>
      (host as HTMLElement & { updateComplete: Promise<boolean> }).updateComplete;
    const click = async (selector: string) => {
      root.querySelector<HTMLButtonElement>(selector)!.click();
      await update();
    };
    await click('[aria-label="Bottom to top"]');
    await click("#draw-card");
    const first = root.querySelector<HTMLElement>(".hand button")!;
    const animations = first.getAnimations({ subtree: true });
    for (const animation of animations) {
      animation.pause();
      animation.currentTime = 350;
    }
    const flipper = first.querySelector<HTMLElement>(".flight-flipper")!;
    const before = getComputedStyle(flipper).transform;
    await click('[aria-label="Right to left"]');
    await click("#draw-card");
    const unaffected = animations.every(
      (a) => first.getAnimations({ subtree: true }).includes(a) && a.currentTime === 350,
    );
    const sameTransform = getComputedStyle(flipper).transform === before;
    const secondAxis =
      root.querySelectorAll<HTMLElement>(".hand .flight-flipper")[1].dataset.flipAxis;
    const undo = [...root.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent?.trim() === "Undo",
    )!;
    undo.click();
    await update();
    undo.click();
    await update();
    const returned = root.querySelector<HTMLElement>(
      '[data-flight-kind="return-deck"] .flight-flipper[data-flip-axis="X"]',
    )!;
    return {
      unaffected,
      sameTransform,
      secondAxis,
      continuedTransform: getComputedStyle(returned).transform === before,
      returnDirection: returned.dataset.flipStartAngle,
      returnEnd: (returned.getAnimations()[0].effect as KeyframeEffect).getKeyframes().at(-1)!
        .transform,
    };
  });
  expect(result).toEqual({
    unaffected: true,
    sameTransform: true,
    secondAxis: "Y",
    continuedTransform: true,
    returnDirection: "-180",
    returnEnd: "rotateX(-180deg)",
  });
});

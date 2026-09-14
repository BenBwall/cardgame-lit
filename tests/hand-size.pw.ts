import { expect, test } from "@playwright/test";

for (const layout of ["Fan", "Grid"]) {
  test(`${layout} hand smoothly grows and shrinks its surrounding box`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 1600 });
    await page.goto("/");
    await page.getByRole("button", { name: `${layout} layout`, exact: true }).click();
    const result = await page.locator("card-game").evaluate(async (host) => {
      const root = host.shadowRoot!;
      const game = root.querySelector<HTMLElement>(".game")!;
      const region = root.querySelector<HTMLElement>(".hand-region")!;
      const content = root.querySelector<HTMLElement>(".hand-content")!;
      const nextFrame = () => new Promise(requestAnimationFrame);
      const update = () =>
        (host as HTMLElement & { updateComplete: Promise<boolean> }).updateComplete;
      const draw = root.querySelector<HTMLButtonElement>("#draw-card")!;
      const undo = [...root.querySelectorAll<HTMLButtonElement>("button")].find(
        (b) => b.textContent?.trim() === "Undo",
      )!;
      const sample = () => {
        const animation = region.getAnimations()[0];
        if (!animation) throw new Error("Expected height animation");
        animation.pause();
        const duration = Number(animation.effect!.getTiming().duration);
        return [0, 0.5, 1].map((progress) => {
          animation.currentTime = duration * progress;
          return {
            region: region.getBoundingClientRect().height,
            box: game.getBoundingClientRect().height,
          };
        });
      };
      const empty = game.getBoundingClientRect().height;
      draw.click();
      await update();
      await nextFrame();
      await nextFrame();
      const first = sample();
      region.getAnimations()[0].finish();
      await Promise.resolve();
      for (let i = 0; i < 12; i++) {
        draw.click();
        await update();
      }
      await nextFrame();
      await nextFrame();
      const growing = sample();
      const animation = region.getAnimations()[0];
      animation.currentTime = Number(animation.effect!.getTiming().duration) / 2;
      const visible = region.getBoundingClientRect().height;
      for (let i = 0; i < 12; i++) {
        undo.click();
        await update();
      }
      await nextFrame();
      await nextFrame();
      const shrinking = sample();
      region.getAnimations()[0].finish();
      await Promise.resolve();
      const natural = Math.abs(
        region.getBoundingClientRect().height - content.getBoundingClientRect().height,
      );
      undo.click();
      await update();
      await nextFrame();
      await nextFrame();
      const last = sample();
      region.getAnimations()[0].finish();
      await Promise.resolve();
      return {
        empty,
        first,
        growing,
        shrinking,
        visible,
        natural,
        last,
        final: game.getBoundingClientRect().height,
      };
    });
    expect(result.first[0].box).toBeCloseTo(result.empty, 0);
    for (const samples of [result.first, result.growing]) {
      expect(samples[1].box).toBeGreaterThan(samples[0].box);
      expect(samples[1].box).toBeLessThan(samples[2].box);
    }
    for (const samples of [result.shrinking, result.last]) {
      expect(samples[1].box).toBeLessThan(samples[0].box);
      expect(samples[1].box).toBeGreaterThan(samples[2].box);
    }
    expect(result.shrinking[0].region).toBeCloseTo(result.visible, 0);
    expect(result.natural).toBeLessThan(0.1);
    expect(result.final).toBeCloseTo(result.empty, 0);
  });
}

test("unrelated draws preserve box and card animations, and reduced motion cancels resizing", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.locator("card-game").evaluate(async (host) => {
    const root = host.shadowRoot!;
    const region = root.querySelector<HTMLElement>(".hand-region")!;
    const draw = root.querySelector<HTMLButtonElement>("#draw-card")!;
    const update = () =>
      (host as HTMLElement & { updateComplete: Promise<boolean> }).updateComplete;
    draw.click();
    await update();
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    const boxAnimation = region.getAnimations()[0];
    boxAnimation.pause();
    boxAnimation.currentTime = 200;
    const card = root.querySelector<HTMLElement>(".hand button")!;
    const flights = card.getAnimations({ subtree: true });
    for (const flight of flights) {
      flight.pause();
      flight.currentTime = 250;
    }
    draw.click();
    await update();
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    return {
      sameBox: region.getAnimations()[0] === boxAnimation && boxAnimation.currentTime === 200,
      sameFlights: flights.every(
        (flight) =>
          card.getAnimations({ subtree: true }).includes(flight) && flight.currentTime === 250,
      ),
    };
  });
  expect(result).toEqual({ sameBox: true, sameFlights: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(() => page.locator(".hand-region").evaluate((node) => node.getAnimations().length))
    .toBe(0);
  await page.getByRole("button", { name: "Draw a card" }).click();
  await expect(page.locator(".card-flight")).toHaveCount(0);
  expect(await page.locator(".hand-region").evaluate((node) => node.getAnimations().length)).toBe(
    0,
  );
});

import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { faceAssets, backAssets } from "@cardgame/card-art-assets.js";
import { cardId } from "@cardgame/cards.js";
import type { GameState } from "@cardgame/game-state.js";
import { type CardArtwork } from "@cardgame/card-art.js";

const settings = (page: Page) => page.locator("card-appearance");
const imageFile = (name = "A-Spades.png") => ({
  name,
  mimeType: "image/png",
  buffer: readFileSync(new URL(faceAssets.wildlife["A-Spades"])),
});
const art = (page: Page) =>
  settings(page).evaluate((node) => (node as unknown as { value: CardArtwork }).value);
const background = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((node) => {
      const image = node instanceof HTMLImageElement ? node : node.querySelector("img");
      return image?.src ?? getComputedStyle(node).backgroundImage;
    });
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await settings(page).getByRole("button", { name: "Card appearance", exact: true }).click();
  await expect(
    settings(page).getByRole("combobox", { name: "Card to customize", exact: true }),
  ).toHaveValue("A-Spades");
});

test("built-in faces and backs render offline in both games and survive refresh", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const results = await page.evaluate(
    async (images) =>
      Promise.all(
        images.map(async (src) => {
          const image = new Image();
          image.src = src;
          await image.decode();
          return image.naturalWidth > 0 && image.naturalHeight > 0;
        }),
      ),
    [...Object.values(faceAssets).flatMap(Object.values), ...Object.values(backAssets)].map(
      (source) => `/${source.slice(source.indexOf("assets/cards/"))}`,
    ),
  );
  expect(results.every(Boolean)).toBe(true);
  expect(await art(page)).toMatchObject({ faces: "wildlife", back: "wildlife" });
  await expect(page.locator("card-game #draw-card img")).toBeVisible();
  await expect(page.locator("card-game #draw-card .back-mark")).toHaveCount(0);
  await settings(page)
    .getByRole("combobox", { name: "Card faces", exact: true })
    .selectOption("kenney");
  await settings(page)
    .getByRole("combobox", { name: "Card back", exact: true })
    .selectOption("wildlife-3");
  await settings(page).getByRole("button", { name: "Card appearance", exact: true }).click();
  await expect(page.locator("card-game #draw-card .back-mark")).toHaveCount(0);
  await page.getByRole("button", { name: "Draw a card", exact: true }).click();
  expect(await background(page, "card-game .hand .card-art")).toContain("/assets/cards/");
  expect(await background(page, "card-game #draw-card")).toContain(
    "/assets/cards/backs/wildlife-3.png",
  );
  const before = await page
    .locator("card-game")
    .evaluate((node) => (node as unknown as { game: unknown }).game);
  await page.reload();
  expect(await art(page)).toMatchObject({ faces: "kenney", back: "wildlife-3" });
  await settings(page).getByRole("button", { name: "Card appearance", exact: true }).click();
  await expect(
    settings(page).getByRole("combobox", { name: "Card faces", exact: true }),
  ).toHaveValue("kenney");
  await expect(
    settings(page).getByRole("combobox", { name: "Card back", exact: true }),
  ).toHaveValue("wildlife-3");
  await settings(page).getByRole("button", { name: "Card appearance", exact: true }).click();
  expect(
    await page.locator("card-game").evaluate((node) => (node as unknown as { game: unknown }).game),
  ).toEqual(before);
  await page.getByRole("tab", { name: "Shithead", exact: true }).click();
  await page.getByRole("tab", { name: "Single player", exact: true }).click();
  expect(await background(page, "shithead-game .hand .card-art")).toContain("/assets/cards/");
  expect(await background(page, "shithead-game .opponent-hand .back")).toContain(
    "/assets/cards/backs/wildlife-3.png",
  );
  expect(
    await page
      .locator("shithead-game .back-mark")
      .evaluateAll((nodes) =>
        nodes.every((node) => getComputedStyle(node).visibility === "hidden"),
      ),
  ).toBe(true);
  await settings(page).getByRole("button", { name: "Card appearance", exact: true }).click();
  await settings(page)
    .getByRole("combobox", { name: "Card faces", exact: true })
    .selectOption("wildlife");
  await page.setViewportSize({ width: 320, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("custom face and back uploads persist, can be cleared, and never change the deal", async ({
  page,
}) => {
  const before = await page
    .locator("card-game")
    .evaluate((node) => (node as unknown as { game: GameState }).game);
  const nextCard = before.deck.at(-1)!;
  const id = cardId(nextCard);
  await settings(page)
    .getByRole("combobox", { name: "Card to customize", exact: true })
    .selectOption(id);
  await settings(page)
    .getByLabel("Upload card face", { exact: true })
    .setInputFiles(imageFile("my-art.png"));
  await expect.poll(() => art(page).then((value) => value.faces)).toBe("custom");
  await settings(page)
    .getByLabel("Upload a back", { exact: true })
    .setInputFiles(imageFile("my-back.png"));
  await expect.poll(() => art(page).then((value) => value.back)).toBe("custom");
  const saved = await art(page);
  expect(saved.customFaces[id]).toContain("data:image/");
  expect(
    await page.locator("card-game").evaluate((node) => (node as unknown as { game: unknown }).game),
  ).toEqual(before);
  await settings(page).getByRole("button", { name: "Card appearance", exact: true }).click();
  await page.getByRole("button", { name: "Draw a card", exact: true }).click();
  expect(await background(page, "card-game .hand .card-art")).toContain(saved.customFaces[id]);
  await page.reload();
  expect(await art(page)).toEqual(saved);
  expect(await background(page, "card-game #draw-card")).toContain(saved.customBack);
  await settings(page).getByRole("button", { name: "Card appearance", exact: true }).click();
  await settings(page).getByRole("button", { name: "Clear custom faces", exact: true }).click();
  await settings(page).getByRole("button", { name: "Remove custom back", exact: true }).click();
  await page.reload();
  expect(await art(page)).toEqual({
    faces: "basic",
    back: "basic",
    customFaces: {},
    customBack: "",
  });
});

test("a complete custom deck imports atomically and invalid images leave it intact", async ({
  page,
}) => {
  await settings(page)
    .getByLabel("Import card faces", { exact: true })
    .setInputFiles(Object.keys(faceAssets.kenney).map((id) => imageFile(`${id}.png`)));
  await expect(settings(page).getByText("52 of 52 custom faces", { exact: true })).toBeVisible();
  const saved = await art(page);
  await page.reload();
  expect(await art(page)).toEqual(saved);
  await settings(page).getByRole("button", { name: "Card appearance", exact: true }).click();
  await settings(page)
    .getByLabel("Import card faces", { exact: true })
    .setInputFiles([imageFile("A-Spades.png"), imageFile("unmatched.png")]);
  await expect(settings(page).getByRole("alert")).toContainText("Could not match unmatched.png");
  expect(await art(page)).toEqual(saved);
  await settings(page)
    .getByLabel("Upload a back", { exact: true })
    .setInputFiles({ name: "bad.png", mimeType: "image/png", buffer: Buffer.from("not an image") });
  await expect(settings(page).getByRole("alert")).toContainText("could not be read");
  expect(await art(page)).toEqual(saved);
});

test("blocked artwork storage preserves the previous choice and shows an error", async ({
  page,
}) => {
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.endsWith(":artwork")) throw new Error("Quota exceeded");
      original.call(this, key, value);
    };
  });
  await settings(page)
    .getByRole("combobox", { name: "Card faces", exact: true })
    .selectOption("kenney");
  await expect(settings(page).getByRole("alert")).toContainText("could not be saved");
  await expect(
    settings(page).getByRole("combobox", { name: "Card faces", exact: true }),
  ).toHaveValue("wildlife");
  expect((await art(page)).faces).toBe("wildlife");
});

test("basic back color and patterns match previews and both tables, persist, and preserve old saves", async ({
  page,
}) => {
  // Existing saved original artwork retains its choice under the new Basic label.
  await page.locator("card-game").evaluate((node) => {
    const key = (node as unknown as { storageKey: string }).storageKey;
    localStorage.setItem(
      `${key}:artwork`,
      JSON.stringify({
        version: 1,
        data: { faces: "original", back: "original", customFaces: {}, customBack: "" },
      }),
    );
  });
  await page.reload();
  await settings(page).getByRole("button", { name: "Card appearance", exact: true }).click();
  await expect(
    settings(page).getByRole("combobox", { name: "Card faces", exact: true }),
  ).toHaveValue("basic");
  await expect(
    settings(page)
      .getByRole("combobox", { name: "Card back", exact: true })
      .locator("option:checked"),
  ).toHaveText("Basic (HTML+CSS)");
  await expect(settings(page).getByLabel("Basic back color", { exact: true })).toHaveValue(
    "#365443",
  );
  await settings(page).getByLabel("Basic back color", { exact: true }).fill("#8844cc");
  const pattern = settings(page).getByRole("combobox", { name: "Basic back pattern", exact: true });
  for (const value of ["diagonal", "vertical", "horizontal", "plain"]) {
    await pattern.selectOption(value);
    const preview = await background(page, "card-appearance .basic-back");
    expect(await background(page, "card-game #draw-card")).toBe(preview);
    expect(preview).toContain("136, 68, 204");
    expect(preview.includes("repeating-linear-gradient")).toBe(value !== "plain");
    if (value !== "plain")
      expect(preview).toContain(`${{ diagonal: 45, vertical: 90, horizontal: 0 }[value]}deg`);
  }
  const saved = await art(page);
  await page.reload();
  expect(await art(page)).toEqual(saved);
  await page.getByRole("tab", { name: "Shithead", exact: true }).click();
  const back = await background(page, "shithead-game .opponent-hand .back");
  expect(back).toContain("136, 68, 204");
  expect(back).not.toContain("repeating-linear-gradient");
  await settings(page).getByRole("button", { name: "Card appearance", exact: true }).click();
  const chooseBack = settings(page).getByRole("combobox", { name: "Card back", exact: true });
  await chooseBack.selectOption("wildlife");
  await expect(settings(page).getByLabel("Basic back color", { exact: true })).toHaveCount(0);
  expect(await background(page, "shithead-game .opponent-hand .back")).toContain("/assets/cards/");
  await chooseBack.selectOption("basic");
  await expect(settings(page).getByLabel("Basic back color", { exact: true })).toHaveValue(
    "#8844cc",
  );
  expect(await background(page, "shithead-game .opponent-hand .back")).toBe(back);
});

test("secondary back color follows the main color until customized and can return to automatic", async ({
  page,
}) => {
  await settings(page)
    .getByRole("combobox", { name: "Card back", exact: true })
    .selectOption("basic");
  const main = settings(page).getByLabel("Basic back color", { exact: true });
  const secondary = settings(page).getByLabel("Basic back secondary color", { exact: true });
  const reset = settings(page).getByRole("button", {
    name: "Use automatic stripe color",
    exact: true,
  });
  await expect(secondary).toHaveValue("#4b765e");
  await expect(reset).toBeDisabled();
  await main.fill("#000000");
  await expect(secondary).toHaveValue("#262626");
  await secondary.fill("#ff8800");
  await main.fill("#ffffff");
  await expect(secondary).toHaveValue("#ff8800");
  const preview = await background(page, "card-appearance .basic-back");
  expect(preview).toContain("255, 136, 0");
  expect(await background(page, "card-game #draw-card")).toBe(preview);
  await page.reload();
  await settings(page).getByRole("button", { name: "Card appearance", exact: true }).click();
  await expect(secondary).toHaveValue("#ff8800");
  await reset.click();
  await expect(secondary).toHaveValue("#ffffff");
  await main.fill("#000000");
  await expect(secondary).toHaveValue("#262626");
  await page.reload();
  await settings(page).getByRole("button", { name: "Card appearance", exact: true }).click();
  await expect(reset).toBeDisabled();
  await expect(secondary).toHaveValue("#262626");
  expect((await art(page)).basicBackSecondaryColor).toBeUndefined();
});

test("artwork follows animated draws and the play pile", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await settings(page)
    .getByRole("combobox", { name: "Card faces", exact: true })
    .selectOption("wildlife");
  await settings(page)
    .getByRole("combobox", { name: "Card back", exact: true })
    .selectOption("kenney");
  await settings(page).getByRole("button", { name: "Card appearance", exact: true }).click();
  await page.getByRole("button", { name: "Draw a card", exact: true }).click();
  const flying = page.locator("card-game .card-flight .card-art");
  await expect(flying).toHaveCount(1);
  expect(await flying.evaluate((node) => (node as HTMLImageElement).src)).toContain(
    "/assets/cards/",
  );
  await expect(page.locator("card-game .card-flight")).toHaveCount(0);
  await page.locator("card-game .hand button").click();
  await expect(page.locator("card-game .card-flight")).toHaveCount(0);
  expect(await background(page, "card-game .played-pile .card-art")).toContain("/assets/cards/");
});

import { expect, test, type Page } from "@playwright/test";
import { faceAssets, backAssets } from "../src/card-art-assets.js";
import { type CardArtwork } from "../src/card-art.js";

const settings = (page: Page) => page.locator("card-appearance");
const imageFile = (name = "A-Spades.png") => ({
  name,
  mimeType: "image/png",
  buffer: Buffer.from(faceAssets.wildlife["A-Spades"].split(",")[1], "base64"),
});
const art = (page: Page) =>
  settings(page).evaluate((node) => (node as unknown as { value: CardArtwork }).value);
const background = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((node) => getComputedStyle(node).backgroundImage);
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await settings(page).getByText("Card appearance", { exact: true }).click();
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
    [...Object.values(faceAssets).flatMap(Object.values), ...Object.values(backAssets)],
  );
  expect(results.every(Boolean)).toBe(true);
  await settings(page)
    .getByRole("combobox", { name: "Card faces", exact: true })
    .selectOption("kenney");
  await settings(page)
    .getByRole("combobox", { name: "Card back", exact: true })
    .selectOption("wildlife-3");
  await settings(page).getByText("Card appearance", { exact: true }).click();
  await page.getByRole("button", { name: "Draw a card", exact: true }).click();
  expect(await background(page, "card-game .hand .card-art")).toContain("data:image/png;base64");
  expect(await background(page, "card-game #draw-card")).toContain(backAssets["wildlife-3"]);
  const before = await page
    .locator("card-game")
    .evaluate((node) => (node as unknown as { game: unknown }).game);
  await page.reload();
  expect(await art(page)).toMatchObject({ faces: "kenney", back: "wildlife-3" });
  await settings(page).getByText("Card appearance", { exact: true }).click();
  await expect(
    settings(page).getByRole("combobox", { name: "Card faces", exact: true }),
  ).toHaveValue("kenney");
  await expect(
    settings(page).getByRole("combobox", { name: "Card back", exact: true }),
  ).toHaveValue("wildlife-3");
  await settings(page).getByText("Card appearance", { exact: true }).click();
  expect(
    await page.locator("card-game").evaluate((node) => (node as unknown as { game: unknown }).game),
  ).toEqual(before);
  await page.getByRole("combobox", { name: "Game", exact: true }).selectOption("shithead");
  expect(await background(page, "shithead-game .hand .card-art")).toContain(
    "data:image/png;base64",
  );
  expect(await background(page, "shithead-game .opponent-hand .back")).toContain(
    backAssets["wildlife-3"],
  );
  await settings(page).getByText("Card appearance", { exact: true }).click();
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
    .evaluate(
      (node) => (node as unknown as { game: { deck: { rank: string; suit: string }[] } }).game,
    );
  const nextCard = before.deck.at(-1)!;
  const id = `${nextCard.rank}-${nextCard.suit}`;
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
  await settings(page).getByText("Card appearance", { exact: true }).click();
  await page.getByRole("button", { name: "Draw a card", exact: true }).click();
  expect(await background(page, "card-game .hand .card-art")).toContain(saved.customFaces[id]);
  await page.reload();
  expect(await art(page)).toEqual(saved);
  expect(await background(page, "card-game #draw-card")).toContain(saved.customBack);
  await settings(page).getByText("Card appearance", { exact: true }).click();
  await settings(page).getByRole("button", { name: "Clear custom faces", exact: true }).click();
  await settings(page).getByRole("button", { name: "Remove custom back", exact: true }).click();
  await page.reload();
  expect(await art(page)).toEqual({
    faces: "original",
    back: "original",
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
  await settings(page).getByText("Card appearance", { exact: true }).click();
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
    .selectOption("wildlife");
  await expect(settings(page).getByRole("alert")).toContainText("could not be saved");
  await expect(
    settings(page).getByRole("combobox", { name: "Card faces", exact: true }),
  ).toHaveValue("original");
  expect((await art(page)).faces).toBe("original");
});

test("artwork follows animated draws and the play pile", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await settings(page)
    .getByRole("combobox", { name: "Card faces", exact: true })
    .selectOption("wildlife");
  await settings(page)
    .getByRole("combobox", { name: "Card back", exact: true })
    .selectOption("kenney");
  await settings(page).getByText("Card appearance", { exact: true }).click();
  await page.getByRole("button", { name: "Draw a card", exact: true }).click();
  const flying = page.locator("card-game .card-flight .card-art");
  await expect(flying).toHaveCount(1);
  expect(await flying.evaluate((node) => getComputedStyle(node).backgroundImage)).toContain(
    "data:image/png;base64",
  );
  await expect(page.locator("card-game .card-flight")).toHaveCount(0);
  await page.locator("card-game .hand button").click();
  await expect(page.locator("card-game .card-flight")).toHaveCount(0);
  expect(await background(page, "card-game .played-pile .card-art")).toContain(
    "data:image/png;base64",
  );
});

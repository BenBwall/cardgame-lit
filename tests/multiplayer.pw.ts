import { expect, test, type Page } from "@playwright/test";
import type { OnlineClient } from "../src/multiplayer/client.js";
import type { OnlineLobby, LobbyGame } from "../src/multiplayer/online-lobby.js";
import type { RoomView } from "../src/multiplayer/protocol.js";
import type { OnlineShitheadView } from "../src/multiplayer/shithead-view.js";
import { canPlayShithead, shitheadRank } from "../src/shithead-state.js";
import { cardName, type Card } from "../src/cards.js";

const strength = (card: Card) =>
  card.rank === "10" ? 16 : card.rank === "2" ? 15 : shitheadRank(card);

const lobby = (page: Page) => page.locator("online-lobby");
const snapshot = (page: Page) =>
  lobby(page).evaluate((element) => (element as unknown as { client: OnlineClient }).client.room!);
async function open(page: Page, counter = false) {
  await page.goto("/");
  await page.locator("card-game").evaluate((element) => {
    (element as HTMLElement & { multiplayerUrl: string }).multiplayerUrl = "http://127.0.0.1:8787";
  });
  await page.getByRole("tab", { name: "Shithead", exact: true }).click();
  await page.getByRole("tab", { name: "Multiplayer", exact: true }).click();
  if (counter)
    await lobby(page).evaluate((element) => {
      const game = {
        id: "test-counter",
        title: "Test counter",
        defaults: () => ({ target: 2 }),
        options: () => "Target: 2",
        board: (room: RoomView<{ count: number }>) => `Count: ${room.state!.count}`,
      } as unknown as LobbyGame;
      (element as OnlineLobby).games = [game];
    });
  await lobby(page).getByRole("textbox", { name: "Display username" }).fill("Same name");
}
async function joinPair(a: Page, b: Page, counter = false) {
  await open(a, counter);
  await open(b, counter);
  await lobby(a).getByRole("button", { name: "Create room", exact: true }).click();
  await expect(lobby(a).locator(".code")).toBeVisible();
  const code = await lobby(a).locator(".code").innerText();
  await lobby(b).getByRole("textbox", { name: "Room code" }).fill(code.toLowerCase());
  await lobby(b).getByRole("button", { name: "Join room", exact: true }).click();
  await expect(lobby(b).getByRole("list", { name: "Players" }).getByRole("listitem")).toHaveCount(
    2,
  );
  await expect.poll(async () => (await snapshot(a)).players.every((p) => p.connected)).toBe(true);
  await lobby(a).getByRole("button", { name: "Start game", exact: true }).click();
  await expect.poll(async () => (await snapshot(b)).phase).toBe("playing");
}
async function synchronized(a: Page, b: Page) {
  await expect
    .poll(async () => (await snapshot(a)).revision === (await snapshot(b)).revision)
    .toBe(true);
}

test("two anonymous browsers synchronize Shithead, protect hidden information and reconnect", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const ca = await browser.newContext(),
    cb = await browser.newContext();
  const a = await ca.newPage(),
    b = await cb.newPage();
  const errors: string[] = [],
    frames: string[][] = [[], []];
  for (const [i, page] of [a, b].entries()) {
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("websocket", (socket) =>
      socket.on("framereceived", ({ payload }) => frames[i].push(String(payload))),
    );
  }
  try {
    await joinPair(a, b);
    const initialA = (await snapshot(a)) as RoomView<OnlineShitheadView>;
    const initialB = (await snapshot(b)) as RoomView<OnlineShitheadView>;
    await a.getByRole("tab", { name: "Single player", exact: true }).click();
    await a.getByRole("tab", { name: "Multiplayer", exact: true }).click();
    await a.getByRole("tab", { name: "Free play", exact: true }).click();
    await a.getByRole("tab", { name: "Shithead", exact: true }).click();
    expect((await snapshot(a)).self).toBe(initialA.self);
    expect((await snapshot(a)).revision).toBe(initialA.revision);
    await a.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            document.documentElement.dataset.copiedCode = value;
          },
        },
      });
    });
    await lobby(a).getByRole("button", { name: "Copy room code", exact: true }).click();
    await expect(a.locator("html")).toHaveAttribute("data-copied-code", initialA.code);
    expect(initialA.self).not.toBe(initialB.self);
    expect(initialA.players.map((p) => p.username)).toEqual(["Same name", "Same name"]);
    expect(initialA.state!.players[1].hand).toBeNull();
    expect(initialB.state!.players[0].hand).toBeNull();
    for (const [seat, view] of [initialA, initialB].entries()) {
      for (const card of view.state!.players[seat].hand!)
        expect(frames[1 - seat].join("")).not.toContain(JSON.stringify(card));
      expect(frames[seat].join("")).not.toMatch(/credential|credentialHash|"faceDown":|"stock":/);
    }
    await lobby(a).getByRole("button", { name: "Swap cards", exact: true }).click();
    await synchronized(a, b);
    await lobby(a).getByRole("button", { name: "Ready to play", exact: true }).click();
    await expect
      .poll(async () => ((await snapshot(b)).state as OnlineShitheadView).ready[0])
      .toBe(true);
    await lobby(b).getByRole("button", { name: "Ready to play", exact: true }).click();
    await expect(lobby(a).locator('[data-phase="playing"]')).toBeVisible();
    for (let i = 0; i < 12; i++) {
      await synchronized(a, b);
      const view = (await snapshot(a)).state as OnlineShitheadView;
      const actor = [a, b][view.turn];
      const own = (await snapshot(actor)).state as OnlineShitheadView;
      const cards = own.players[own.actor].hand!;
      const card = cards
        .filter((c) => canPlayShithead(c, own.pile))
        .sort((x, y) => shitheadRank(x) - shitheadRank(y))[0];
      const oldRevision = (await snapshot(actor)).revision;
      if (card)
        await lobby(actor)
          .getByRole("button", { name: `Play ${cardName(card)}`, exact: true })
          .click();
      else await lobby(actor).getByRole("button", { name: "Pick up pile", exact: true }).click();
      await expect.poll(async () => (await snapshot(a)).revision).toBeGreaterThan(oldRevision);
      await synchronized(a, b);
      const va = (await snapshot(a)).state as OnlineShitheadView,
        vb = (await snapshot(b)).state as OnlineShitheadView;
      expect(va.pile).toEqual(vb.pile);
      expect(va.stockCount).toBe(vb.stockCount);
      expect(va.turn).toBe(vb.turn);
    }
    const before = await snapshot(a);
    await lobby(a).evaluate((element) => {
      const client = (element as unknown as { client: OnlineClient & { socket: WebSocket } })
        .client;
      (client as unknown as { socket: WebSocket }).socket.close();
    });
    await expect.poll(async () => (await snapshot(a)).revision).toBeGreaterThan(before.revision);
    await expect(lobby(a).getByRole("status").first()).toHaveText("Connection: connected");
    await synchronized(a, b);
    expect((await snapshot(a)).self).toBe(before.self);
    expect((await snapshot(a)).state).toEqual(before.state);
    // Finish through the actual online controls, including table cards and blind endgame.
    for (let moves = 0; moves < 1000 && (await snapshot(a)).phase !== "finished"; moves++) {
      await synchronized(a, b);
      const turn = ((await snapshot(a)).state as OnlineShitheadView).turn;
      const page = [a, b][turn],
        own = (await snapshot(page)).state as OnlineShitheadView;
      const player = own.players[own.actor],
        revision = (await snapshot(page)).revision;
      if (own.source === "faceDown")
        await lobby(page).getByRole("button", { name: "Play blind card 1", exact: true }).click();
      else {
        const available = own.source === "hand" ? player.hand! : player.faceUp;
        const card = available
          .filter((c) => canPlayShithead(c, own.pile))
          .sort((x, y) => strength(x) - strength(y))[0];
        if (card) {
          const matching = available.filter((c) => c.rank === card.rank);
          for (const selected of matching)
            await lobby(page)
              .getByRole("checkbox", { name: cardName(selected), exact: true })
              .check();
          await lobby(page).getByRole("button", { name: "Play selected", exact: true }).click();
        } else await lobby(page).getByRole("button", { name: "Pick up pile", exact: true }).click();
      }
      await expect.poll(async () => (await snapshot(a)).revision).toBeGreaterThan(revision);
    }
    await synchronized(a, b);
    expect((await snapshot(a)).phase).toBe("finished");
    expect(((await snapshot(a)).state as OnlineShitheadView).winner).toBe(
      ((await snapshot(b)).state as OnlineShitheadView).winner,
    );
    for (const page of [a, b]) {
      const stored = await page.evaluate(() => ({
        local: { ...localStorage },
        session: { ...sessionStorage },
      }));
      expect(JSON.stringify(stored)).not.toMatch(/credential|playerId|ticket|Same name/);
    }
    for (const width of [320, 390, 768, 1440]) {
      await a.setViewportSize({ width, height: 900 });
      expect(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await lobby(b).getByRole("button", { name: "Leave room", exact: true }).click();
    await expect(lobby(b).getByRole("button", { name: "Create room", exact: true })).toBeEnabled();
    await expect(lobby(b).getByRole("alert")).toHaveCount(0);
    await expect(lobby(a).getByRole("alert")).toHaveText("A player left the room.");
    await expect(lobby(a).getByRole("button", { name: "Create room", exact: true })).toBeEnabled();
    expect(errors).toEqual([]);
  } finally {
    await ca.close();
    await cb.close();
  }
});

test("second adapter uses the same lobby, actions, completion and unanimous rematch", async ({
  browser,
}) => {
  const ca = await browser.newContext(),
    cb = await browser.newContext();
  const a = await ca.newPage(),
    b = await cb.newPage();
  try {
    await joinPair(a, b, true);
    await synchronized(a, b);
    const original = await snapshot(a);
    for (const page of [a, b]) {
      await synchronized(a, b);
      const revision = (await snapshot(page)).revision;
      await lobby(page).evaluate((element) =>
        (element as unknown as { client: OnlineClient }).client.send("action", { add: 1 }),
      );
      await expect.poll(async () => (await snapshot(page)).revision).toBeGreaterThan(revision);
    }
    await expect(lobby(a).getByRole("button", { name: "Request rematch" })).toBeVisible();
    await lobby(a).getByRole("button", { name: "Request rematch" }).click();
    await expect.poll(async () => (await snapshot(b)).players[0].rematch).toBe(true);
    expect((await snapshot(b)).round).toBe(1);
    await lobby(b).getByRole("button", { name: "Request rematch" }).click();
    await expect.poll(async () => (await snapshot(a)).round).toBe(2);
    expect((await snapshot(a)).state).toEqual({ count: 0, turn: 0, you: 0 });
    expect((await snapshot(a)).revision).toBeGreaterThan(original.revision);
    await lobby(a).evaluate((element) => {
      (element as OnlineLobby).games = [];
    });
    await expect(lobby(a).getByRole("alert")).toContainText("not supported by this page");
    await lobby(a).getByRole("button", { name: "Leave room", exact: true }).click();
  } finally {
    await ca.close();
    await cb.close();
  }
});

test("lobby errors are accessible; local modes still work when online is unavailable", async ({
  page,
}) => {
  await open(page);
  await lobby(page).getByRole("textbox", { name: "Display username" }).fill("");
  await lobby(page).getByRole("button", { name: "Create room", exact: true }).click();
  await expect(lobby(page).getByRole("alert")).toHaveText("Enter a display username.");
  await lobby(page).getByRole("textbox", { name: "Display username" }).fill("A");
  await lobby(page).getByRole("textbox", { name: "Room code" }).fill("ABCDEF");
  await lobby(page).getByRole("button", { name: "Join room", exact: true }).click();
  await expect(lobby(page).getByRole("alert")).toHaveText("Room unavailable or expired.");
  await page.getByRole("tab", { name: "Free play", exact: true }).click();
  await page.getByRole("button", { name: "Draw a card" }).click();
  await expect(page.getByRole("heading", { name: "Your hand (1)" })).toBeVisible();
  await page.getByRole("tab", { name: "Shithead", exact: true }).click();
  await page.getByRole("tab", { name: "Single player", exact: true }).click();
  await expect(
    page.locator("shithead-game").getByRole("button", { name: "Start game", exact: true }),
  ).toBeVisible();
});

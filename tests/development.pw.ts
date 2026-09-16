import { expect, test } from "@playwright/test";
import { resolve } from "node:path";

test("development starts and connects a configurable local backend without browser overrides", async ({
  browser,
}) => {
  test.setTimeout(60_000);
  const frontend = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
  const backend = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
  const frontendPort = frontend.port!,
    backendPort = backend.port!;
  await frontend.stop(true);
  await backend.stop(true);
  const serverUrl = `http://127.0.0.1:${backendPort}`;
  const child = Bun.spawn([process.execPath, "scripts/preview.ts", "--dev"], {
    cwd: resolve(import.meta.dirname, ".."),
    env: {
      ...process.env,
      PORT: String(frontendPort),
      MULTIPLAYER_PORT: String(backendPort),
      MULTIPLAYER_URL: undefined,
      MULTIPLAYER_DEV_URL: undefined,
      MULTIPLAYER_ORIGINS: undefined,
    },
    stdout: "inherit",
    stderr: "inherit",
  });
  const first = await browser.newContext({ reducedMotion: "reduce" });
  const second = await browser.newContext({ reducedMotion: "reduce" });
  try {
    const url = `http://127.0.0.1:${frontendPort}`;
    await expect
      .poll(
        async () => {
          try {
            return (await fetch(url)).ok;
          } catch {
            return false;
          }
        },
        { timeout: 20_000 },
      )
      .toBe(true);
    const a = await first.newPage(),
      b = await second.newPage();
    for (const page of [a, b]) {
      await page.goto(url);
      await expect(page.locator("card-game")).toHaveAttribute("multiplayer-url", serverUrl);
      await page.getByRole("tab", { name: "Shithead", exact: true }).click();
      await page.getByRole("tab", { name: "Multiplayer", exact: true }).click();
      await page.getByRole("textbox", { name: "Display username" }).fill("Local player");
    }
    await a.getByRole("button", { name: "Create room", exact: true }).click();
    await expect(a.locator("online-lobby .code")).toBeVisible();
    await b
      .getByRole("textbox", { name: "Room code" })
      .fill(await a.locator("online-lobby .code").innerText());
    await b.getByRole("button", { name: "Join room", exact: true }).click();
    await expect(b.getByRole("list", { name: "Players" }).getByRole("listitem")).toHaveCount(2);
    await a.getByRole("button", { name: "Start game", exact: true }).click();
    await expect(b.locator('[aria-label="Online Shithead board"]')).toBeVisible();
  } finally {
    await first.close();
    await second.close();
    child.kill();
    await child.exited;
  }
  await expect
    .poll(async () => {
      try {
        return (await fetch(`${serverUrl}/health`, { signal: AbortSignal.timeout(500) })).ok;
      } catch {
        return false;
      }
    })
    .toBe(false);
});

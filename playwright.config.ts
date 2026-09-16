import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  testMatch: "**/*.pw.ts",
  use: { baseURL: "http://127.0.0.1:4175" },
  projects: [
    { name: "chrome", use: { browserName: "chromium", channel: "chrome" } },
    { name: "firefox", use: { browserName: "firefox" } },
  ],
  webServer: [
    {
      command: "bun scripts/preview.ts",
      url: "http://127.0.0.1:4175",
      reuseExistingServer: false,
    },
    {
      command: "bun scripts/test-online-server.ts",
      url: "http://127.0.0.1:8787/health",
      reuseExistingServer: false,
    },
  ],
});

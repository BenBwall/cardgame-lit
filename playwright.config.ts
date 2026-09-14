import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  testMatch: "**/*.pw.ts",
  use: { baseURL: "http://127.0.0.1:4175", browserName: "chromium", channel: "msedge" },
  webServer: {
    command: "bun scripts/preview.ts",
    url: "http://127.0.0.1:4175",
    reuseExistingServer: false,
  },
});

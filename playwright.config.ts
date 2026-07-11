import { defineConfig } from "playwright/test";

/**
 * E2E against a RUNNING app (dev or prod). We deliberately do not auto-start
 * a server: this repo often has a dev server on :3000 already, and a second
 * one corrupts .next. Set E2E_BASE_URL to point elsewhere.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});

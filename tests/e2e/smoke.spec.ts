import { test, expect } from "playwright/test";

/**
 * Smoke suite — no credentials required. Verifies the app boots, public pages
 * render designed UI (never raw errors), and every protected route redirects
 * to /login when signed out (the workspace-isolation front door).
 */

test("landing page renders without raw errors", async ({ page }) => {
  const res = await page.goto("/");
  expect(res?.ok()).toBeTruthy();
  const body = await page.textContent("body");
  expect(body).not.toContain("Application error");
  expect(body).not.toMatch(/at \w+ \(.+:\d+:\d+\)/); // no stack traces
});

test("login page shows the auth form", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator("input[type=email]").first()).toBeVisible();
  await expect(page.locator("input[type=password]").first()).toBeVisible();
});

const PROTECTED = [
  "/dashboard",
  "/today",
  "/chat",
  "/chat/history",
  "/knowledge",
  "/memory",
  "/tasks",
  "/approvals",
  "/contacts",
  "/connections",
  "/settings",
];

for (const route of PROTECTED) {
  test(`unauthenticated ${route} redirects to /login`, async ({ page }) => {
    await page.goto(route);
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    expect(page.url()).toContain("/login");
  });
}

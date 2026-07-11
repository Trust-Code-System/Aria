import { test, expect } from "playwright/test";

/**
 * Authenticated critical path. Skips cleanly unless E2E_EMAIL/E2E_PASSWORD
 * point at a real account on the target app (RLS applies — the account only
 * sees its own workspaces).
 */
const email = (process.env.E2E_EMAIL ?? "").trim();
const password = (process.env.E2E_PASSWORD ?? "").trim();

test.describe("authenticated flows", () => {
  test.skip(!email || !password, "Set E2E_EMAIL and E2E_PASSWORD to run authed e2e.");

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.locator("input[type=email]").first().fill(email);
    await page.locator("input[type=password]").first().fill(password);
    await page.locator("button[type=submit]").first().click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
  });

  test("Today briefing renders every section", async ({ page }) => {
    await page.goto("/today");
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
    for (const section of ["Approvals waiting", "Tasks in flight", "Follow-ups due", "Review queue"]) {
      await expect(page.getByText(section)).toBeVisible();
    }
  });

  test("workspace switcher lists workspaces", async ({ page }) => {
    await page.goto("/settings");
    const switcher = page.getByRole("button", { expanded: false }).filter({ hasText: /./ }).first();
    await switcher.click();
    await expect(page.getByText("Workspaces", { exact: true })).toBeVisible();
  });

  test("chat history page loads and searches", async ({ page }) => {
    await page.goto("/chat/history");
    await expect(page.getByRole("heading", { name: "Chat history" })).toBeVisible();
    await page.getByPlaceholder("Search conversations…").fill("zzz-no-such-conversation");
    await expect(page.getByText(/No conversations match|No conversations yet/)).toBeVisible({ timeout: 5_000 });
  });

  test("settings shows privacy controls", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByText("Privacy & data")).toBeVisible();
    await expect(page.getByText("Export all memories (JSON)")).toBeVisible();
  });
});

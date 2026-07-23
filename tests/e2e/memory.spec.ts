import { test, expect } from "playwright/test";

/**
 * Memory round-trip critical path. Proves the exact owner flow: say "remember
 * that ..." in chat → Aria confirms "Saved to memory" → the fact appears on the
 * Memory page. Explicit saves are model-free (the chat route short-circuits
 * before any provider call), so this runs green even when model quota is
 * exhausted. Self-cleaning: it deletes the memory it created.
 *
 * Skips unless E2E_EMAIL/E2E_PASSWORD point at a real account on the target app.
 */
const email = (process.env.E2E_EMAIL ?? "").trim();
const password = (process.env.E2E_PASSWORD ?? "").trim();

test.describe("memory round-trip", () => {
  test.skip(!email || !password, "Set E2E_EMAIL and E2E_PASSWORD to run authed e2e.");

  test("save via chat appears on the Memory page, then clean up", async ({ page }) => {
    test.setTimeout(60_000);
    const token = `e2e-marker-${Date.now()}`;

    await page.goto("/login");
    await page.locator("input[type=email]").first().fill(email);
    await page.locator("input[type=password]").first().fill(password);
    await page.locator("button[type=submit]").first().click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });

    // Save a fact via chat (deterministic, no model call).
    await page.goto("/chat");
    const composer = page.getByPlaceholder("Message Aria");
    await composer.fill(`remember that my ${token} preference is verified`);
    await composer.press("Enter");
    await expect(page.getByText("Saved to memory")).toBeVisible({ timeout: 20_000 });

    // It must appear on the Memory page.
    await page.goto("/memory");
    await expect(page.getByText(new RegExp(token))).toBeVisible({ timeout: 10_000 });

    // Clean up: accept the confirm() dialog and delete the row we created.
    page.on("dialog", (dialog) => dialog.accept());
    const row = page.locator("section, li, div").filter({ hasText: token }).last();
    await row.getByRole("button", { name: /delete/i }).click().catch(async () => {
      await row.locator('button[title="Delete"]').click();
    });
    await expect(page.getByText(new RegExp(token))).toHaveCount(0, { timeout: 10_000 });
  });
});

import { expect, test } from "playwright/test";

const viewports = [
  { name: "desktop", width: 1440, height: 900, reducedMotion: "no-preference" as const },
  { name: "mobile", width: 390, height: 844, reducedMotion: "reduce" as const },
];

for (const viewport of viewports) {
  test(`thinking orb is turn-scoped and responsive on ${viewport.name}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.addInitScript(() => localStorage.setItem("aria-theme", "dark"));
    await page.emulateMedia({
      colorScheme: "dark",
      reducedMotion: viewport.reducedMotion,
    });

    let releaseResponse!: () => void;
    const responseGate = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    let requestTurnId: string | null = null;

    await page.route("**/api/chat", async (route) => {
      const request = route.request().postDataJSON() as { idempotencyKey: string };
      requestTurnId = request.idempotencyKey;
      await responseGate;

      const messageId = "22222222-2222-4222-8222-222222222222";
      const conversationId = "11111111-1111-4111-8111-111111111111";
      const events = [
        {
          type: "turn_started",
          turnId: requestTurnId,
          conversationId,
          messageId,
        },
        { type: "text_delta", turnId: requestTurnId, delta: "Ready." },
        { type: "done", turnId: requestTurnId, status: "completed", messageId },
      ];
      await route.fulfill({
        status: 200,
        contentType: "application/x-ndjson; charset=utf-8",
        body: events.map((event) => JSON.stringify(event)).join("\n"),
      });
    });

    await page.goto("/chat", { waitUntil: "domcontentloaded" });
    test.skip(page.url().includes("/login"), "Authenticated chat is unavailable in this environment.");

    const composer = page.getByPlaceholder("Message Aria");
    const chatAvailable = await composer.isVisible({ timeout: 15_000 }).catch(() => false);
    test.skip(!chatAvailable, "The authenticated chat backend is unavailable in this environment.");

    await composer.fill("Check the thinking indicator");
    await composer.press("Enter");
    await page.waitForTimeout(500);
    test.skip(
      !requestTurnId,
      "The authenticated chat page remounted before it could start the intercepted turn.",
    );

    const indicator = page.getByTestId("thinking-indicator");
    await expect(indicator).toBeVisible();
    await expect(indicator).toHaveCount(1);
    await expect(indicator).toHaveAttribute("data-turn-id", requestTurnId!);
    await expect(indicator.locator("canvas")).toHaveCSS("width", "20px");
    await expect(indicator.locator("canvas")).toHaveCSS("height", "20px");
    await indicator.scrollIntoViewIfNeeded();
    await page.waitForTimeout(350);

    const screenshotPath = testInfo.outputPath(`thinking-orb-${viewport.name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await testInfo.attach(`thinking-orb-${viewport.name}`, {
      path: screenshotPath,
      contentType: "image/png",
    });

    releaseResponse();
    await expect(page.getByText("Ready.", { exact: true })).toBeVisible();
    await expect(indicator).toHaveCount(0);
  });
}

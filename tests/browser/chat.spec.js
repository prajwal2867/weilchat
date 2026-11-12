import { test, expect } from "@playwright/test";

test("two separate browser sessions can match, chat, report, and leave", async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await Promise.all([
      pageA.goto("/"),
      pageB.goto("/")
    ]);

    await pageB.locator("label.choice").filter({ hasText: "Female" }).click();

    await pageA.locator("#start-button").click();
    await pageA.locator("#confirm-adult").click();
    await expect(pageA.locator("#searching")).toBeVisible();

    await pageB.locator("#start-button").click();
    await pageB.locator("#confirm-adult").click();

    await expect(pageA.locator("#chat")).toBeVisible();
    await expect(pageB.locator("#chat")).toBeVisible();

    await pageA.locator("#message-input").fill("Hello from browser A");
    await pageA.locator("#message-form button").click();
    await expect(pageB.locator("#messages .message:not(.mine) p")).toHaveText("Hello from browser A");

    await pageB.locator("#message-input").fill("Hello back from browser B");
    await pageB.locator("#message-form button").click();
    await expect(pageA.locator("#messages .message:not(.mine) p")).toHaveText("Hello back from browser B");

    await pageA.locator("#report-button").click();
    await pageA.locator("#submit-report").click();
    await expect(pageA.locator("#chat-status")).toContainText("Report received");
    await expect(pageA.locator("#report-dialog")).not.toBeVisible();

    await pageA.locator("#next-button").click();
    await expect(pageA.locator("#searching")).toBeVisible();
    await expect(pageB.locator("#ended")).toBeVisible();
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

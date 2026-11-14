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

    await expect(pageA.locator("#connection-label")).toHaveText("ONLINE", { timeout: 15000 });
    await expect(pageB.locator("#connection-label")).toHaveText("ONLINE", { timeout: 15000 });
    await pageB.locator("label.choice").filter({ hasText: "Female" }).click();

    await pageA.locator("#start-button").click();
    await pageA.locator("#confirm-adult").click();
    await expect(pageA.locator("#searching")).toBeVisible();

    await pageB.locator("#start-button").click();
    await pageB.locator("#confirm-adult").click();

    await expect(pageA.locator("#chat")).toBeVisible();
    await expect(pageB.locator("#chat")).toBeVisible();

    await pageA.locator("#message-input").fill("Hello from browser A");
    await expect(pageB.locator("#typing-indicator")).toBeVisible();
    await pageA.locator('#message-form button[type=submit]').click();
    await expect(pageB.locator("#typing-indicator")).toBeHidden();
    await expect(pageB.locator("#messages .message-row:not(.mine) .message-bubble p")).toHaveText("Hello from browser A");
    await expect(pageA.locator("#messages .message-row.mine .message-footer")).toHaveCount(0);
    await expect(pageA.locator("#messages .message-row.mine .message-time")).toHaveCount(0);
    await expect(pageA.locator("#messages .message-row.mine .message-sent")).toHaveCount(0);

    await pageB.locator("#message-input").fill("Hello back from browser B");
    await pageB.locator('#message-form button[type=submit]').click();
    await expect(pageA.locator("#messages .message-row:not(.mine) .message-bubble p")).toHaveText("Hello back from browser B");

    await pageA.locator("#profile-button").click();
    await pageA.locator("#report-button").click();
    await pageA.locator("#submit-report").click();
    await expect(pageA.locator("#chat-status")).toContainText("Report received");
    await expect(pageA.locator("#report-dialog")).not.toBeVisible();

    await pageA.locator("#profile-button").click();
    await pageA.locator("#next-button").click();
    await expect(pageA.locator("#searching")).toBeVisible();
    await expect(pageB.locator("#ended")).toBeVisible();
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

import { test, expect } from "@playwright/test";

async function expectTypingIndicatorAligned(page) {
  await expect(page.locator("#messages > :last-child")).toHaveAttribute("id", "typing-indicator");
  await expect(page.locator("#typing-indicator .typing-avatar")).toHaveCount(0);
  const offset = await page.evaluate(() => {
    const messages = document.querySelector("#messages");
    const indicatorBubble = document.querySelector("#typing-indicator .typing-bubble");
    const messageRow = document.querySelector("#messages .message-row");
    const messageAvatar = messageRow.querySelector(".message-avatar");
    const messagesStyle = getComputedStyle(messages);
    const messageRowStyle = getComputedStyle(messageRow);
    const messageRows = document.querySelectorAll("#messages .message-row");
    const expectedLeft = messages.getBoundingClientRect().left +
      parseFloat(messagesStyle.paddingLeft) +
      messageAvatar.getBoundingClientRect().width +
      parseFloat(messageRowStyle.columnGap);
    const previousMessageRow = document.querySelector("#typing-indicator").previousElementSibling;
    const previousMessageBubble = previousMessageRow.querySelector(".message-bubble");
    const firstMessageBubble = messageRows[0].querySelector(".message-bubble");
    const secondMessageBubble = messageRows[1].querySelector(".message-bubble");
    const bubbleRect = indicatorBubble.getBoundingClientRect();
    return {
      offset: Math.abs(bubbleRect.left - expectedLeft),
      verticalGap: bubbleRect.top - previousMessageBubble.getBoundingClientRect().bottom,
      messageGap: secondMessageBubble.getBoundingClientRect().top - firstMessageBubble.getBoundingClientRect().bottom
    };
  });
  expect(offset.offset).toBeLessThan(1);
  expect(offset.verticalGap).toBeGreaterThanOrEqual(14);
  expect(offset.verticalGap).toBeLessThan(16);
  expect(offset.messageGap).toBeGreaterThanOrEqual(14);
  expect(offset.messageGap).toBeLessThan(16);
}

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

    await pageA.waitForTimeout(700);
    await pageA.locator("#message-input").fill("Follow-up from browser A");
    await pageA.locator('#message-form button[type=submit]').click();
    const incomingRows = pageB.locator("#messages .message-row:not(.mine)");
    await expect(incomingRows).toHaveCount(2);
    await expect(incomingRows.nth(0).locator(".message-avatar")).toHaveCSS("visibility", "visible");
    await expect(incomingRows.nth(1).locator(".message-avatar")).toHaveCSS("visibility", "hidden");
    const outgoingRows = pageA.locator("#messages .message-row.mine");
    await expect(outgoingRows).toHaveCount(2);
    await expect(outgoingRows.nth(1).locator(".message-avatar")).toHaveCSS("visibility", "hidden");

    await pageB.locator("#message-input").fill("Hello back from browser B");
    await expect(pageA.locator("#typing-indicator")).toBeVisible();
    await expectTypingIndicatorAligned(pageA);
    expect(await pageA.locator("#typing-indicator").evaluate(element => element.previousElementSibling?.innerText)).toContain("Follow-up from browser A");
    await pageB.locator('#message-form button[type=submit]').click();
    await expect(pageA.locator("#messages .message-row:not(.mine) .message-bubble p")).toHaveText("Hello back from browser B");

    await pageA.locator("#message-input").fill("Typing from browser A");
    await expect(pageB.locator("#typing-indicator")).toBeVisible();
    await expectTypingIndicatorAligned(pageB);
    expect(await pageB.locator("#typing-indicator").evaluate(element => element.previousElementSibling?.innerText)).toContain("Hello back from browser B");
    await pageB.setViewportSize({ width: 390, height: 844 });
    await expectTypingIndicatorAligned(pageB);
    await pageA.locator("#message-input").fill("");
    await expect(pageB.locator("#typing-indicator")).toBeHidden();

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

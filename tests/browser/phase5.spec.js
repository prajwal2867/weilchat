import { test, expect } from "@playwright/test";

async function enterSearch(page, gender = "man") {
  await expect(page.locator("#connection-label")).toHaveText("ONLINE", { timeout: 15000 });
  if (gender === "woman") {
    await page.locator("label.choice").filter({ hasText: "Female" }).click();
  }
  await page.locator("#start-button").click();
  await page.locator("#confirm-adult").click();
  await expect(page.locator("#searching")).toBeVisible();
}

async function matchTwo(pageA, pageB) {
  await enterSearch(pageA, "man");
  await enterSearch(pageB, "woman");
  await expect(pageA.locator("#chat")).toBeVisible();
  await expect(pageB.locator("#chat")).toBeVisible();
}

test("a waiting user reconnects and can still be matched", async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await Promise.all([pageA.goto("/"), pageB.goto("/")]);
    await enterSearch(pageA);

    await contextA.setOffline(true);
    await expect(pageA.locator("#connection-label")).toHaveText("RECONNECTING");
    await contextA.setOffline(false);
    await expect(pageA.locator("#connection-label")).toHaveText("ONLINE", { timeout: 15000 });
    await expect(pageA.locator("#searching")).toBeVisible();

    await enterSearch(pageB, "woman");
    await expect(pageA.locator("#chat")).toBeVisible({ timeout: 15000 });
    await expect(pageB.locator("#chat")).toBeVisible();
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test("an interrupted chat ends cleanly and both users can reconnect into a new chat", async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await Promise.all([pageA.goto("/"), pageB.goto("/")]);
    await matchTwo(pageA, pageB);

    await contextA.setOffline(true);
    await expect(pageA.locator("#connection-label")).toHaveText("RECONNECTING");
    await expect(pageA.locator("#ended")).toBeVisible({ timeout: 10000 });
    await expect(pageB.locator("#ended")).toBeVisible({ timeout: 10000 });

    await contextA.setOffline(false);
    await expect(pageA.locator("#connection-label")).toHaveText("ONLINE", { timeout: 15000 });
    await pageA.locator("#again-button").click();
    await expect(pageA.locator("#searching")).toBeVisible();

    await pageB.locator("#again-button").click();
    await expect(pageA.locator("#chat")).toBeVisible({ timeout: 15000 });
    await expect(pageB.locator("#chat")).toBeVisible();
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test("mobile layout keeps chat, message controls, and report dialog inside the viewport", async ({ browser }) => {
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2
  });
  const desktop = await browser.newContext();
  const mobilePage = await mobile.newPage();
  const desktopPage = await desktop.newPage();

  try {
    await Promise.all([mobilePage.goto("/"), desktopPage.goto("/")]);
    await matchTwo(mobilePage, desktopPage);

    const initialMetrics = await mobilePage.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
      chat: document.querySelector("#chat").getBoundingClientRect().toJSON(),
      input: document.querySelector("#message-input").getBoundingClientRect().toJSON(),
      send: document.querySelector('.message-form button[type=submit]').getBoundingClientRect().toJSON(),
    }));
    expect(initialMetrics.document).toBeLessThanOrEqual(initialMetrics.viewport);
    expect(initialMetrics.chat.left).toBeGreaterThanOrEqual(0);
    expect(initialMetrics.chat.right).toBeLessThanOrEqual(initialMetrics.viewport);
    expect(initialMetrics.input.width).toBeGreaterThan(80);
    expect(initialMetrics.send.width).toBeGreaterThan(40);

    await mobilePage.locator("#message-input").fill("Mobile browser says hello");
    await mobilePage.locator('.message-form button[type=submit]').click();
    await expect(desktopPage.locator("#messages .message-row:not(.mine) .message-bubble p")).toHaveText("Mobile browser says hello");

    await mobilePage.locator("#profile-button").click();
    await mobilePage.locator("#report-button").click();
    await expect(mobilePage.locator("#report-dialog")).toBeVisible();
    const dialog = await mobilePage.locator("#report-dialog").boundingBox();
    expect(dialog.x).toBeGreaterThanOrEqual(0);
    expect(dialog.x + dialog.width).toBeLessThanOrEqual(390);
    expect(dialog.y).toBeGreaterThanOrEqual(0);
    expect(dialog.y + dialog.height).toBeLessThanOrEqual(844);
    await mobilePage.locator("#report-dialog button[value=cancel]").click();
    await expect(mobilePage.locator("#report-dialog")).not.toBeVisible();
  } finally {
    await mobile.close();
    await desktop.close();
  }
});

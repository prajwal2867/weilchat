import { test, expect } from "@playwright/test";

test("mobile chat fills the viewport and exposes sidebar tools in the overflow menu", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator("#chat").evaluate(element => element.classList.remove("hidden"));
  await page.locator("body").evaluate(element => element.classList.add("chat-mode"));

  await expect(page.locator(".chat-sidebar")).toBeHidden();
  await expect(page.locator(".chat-workspace")).toBeVisible();
  await expect(page.locator(".chat-app-header")).toBeVisible();

  await page.locator("#profile-button").click();
  const menu = page.locator("#profile-menu");
  await expect(menu).toBeVisible();
  await expect(menu.locator("#report-button")).toBeVisible();
  await expect(menu.locator("#next-button")).toBeVisible();
  for (const label of ["weilchat", "Home", "Explore", "History", "Settings", "Recent Chats"]) {
    await expect(menu.getByText(label, { exact: true })).toBeVisible();
  }

  await expect(menu.locator(".promo-link")).toBeVisible();

  await menu.locator(".recent-chat").filter({ hasText: "Study Plan" }).click();
  await expect(page.locator("#chat-title")).toHaveText("Study Plan");
  await expect(menu).toBeHidden();

  await page.locator("#profile-button").click();
  await expect(menu).toBeVisible();
  await page.locator("#profile-button").click();
  await expect(menu).toBeHidden();
});

test("desktop chat keeps its sidebar outside the overflow menu", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.locator("#chat").evaluate(element => element.classList.remove("hidden"));
  await page.locator("body").evaluate(element => element.classList.add("chat-mode"));
  await expect(page.locator(".chat-sidebar")).toBeVisible();
  await page.locator("#profile-button").click();
  await expect(page.locator("#mobile-sidebar-menu")).toBeHidden();
});

test("mobile keyboard viewport resize keeps message scroll position and lifts the composer", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator("#chat").evaluate(element => element.classList.remove("hidden"));
  await page.locator("body").evaluate(element => element.classList.add("chat-mode"));
  await page.locator("#messages").evaluate(element => {
    for (let i = 0; i < 30; i++) {
      const row = document.createElement("article");
      row.className = "message-row";
      row.innerHTML = '<div class="message-content"><div class="message-bubble"><p>Message ' + i + '</p></div></div>';
      element.append(row);
    }
    element.scrollTop = 120;
  });

  const before = await page.locator("#messages").evaluate(element => ({
    scrollTop: element.scrollTop,
    composerBottom: document.querySelector("#message-form").getBoundingClientRect().bottom,
    chatHeight: document.querySelector("#chat").getBoundingClientRect().height
  }));
  await page.locator("#message-input").focus();
  await page.setViewportSize({ width: 390, height: 540 });
  await expect.poll(() => page.locator("#messages").evaluate(element => element.clientHeight)).toBeLessThan(600);

  const after = await page.locator("#messages").evaluate(element => ({
    scrollTop: element.scrollTop,
    composerBottom: document.querySelector("#message-form").getBoundingClientRect().bottom,
    chatHeight: document.querySelector("#chat").getBoundingClientRect().height,
    documentHeight: document.documentElement.scrollHeight
  }));
  expect(after.chatHeight).toBeLessThan(before.chatHeight);
  expect(after.composerBottom).toBeLessThanOrEqual(540);
  expect(after.scrollTop).toBe(before.scrollTop);
  expect(after.documentHeight).toBeLessThanOrEqual(540);
});

test("mobile overflow menu is left aligned and animates open and closed", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator("#chat").evaluate(element => element.classList.remove("hidden"));
  await page.locator("body").evaluate(element => element.classList.add("chat-mode"));
  const menu = page.locator("#profile-menu");
  await page.locator("#profile-button").click();
  await expect(menu).toBeVisible();
  const bounds = await menu.boundingBox();
  expect(bounds.x).toBeLessThan(30);
  const transition = await menu.evaluate(element => getComputedStyle(element).transitionDuration);
  expect(transition).not.toBe("0s");
  await page.locator("#profile-button").click();
  await expect(menu).toBeHidden();
});

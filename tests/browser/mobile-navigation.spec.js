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

  await menu.locator(".recent-chat").filter({ hasText: "Study Plan" }).click();
  await expect(page.locator("#chat-title")).toHaveText("Study Plan");
  await expect(menu).toBeVisible();

  await expect(menu.locator(".promo-link")).toBeVisible();

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

import { test, expect } from "@playwright/test";

test("landing page presents the new hero and keeps future navigation inert", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#landing")).toBeVisible();
  await expect(page.locator("#landing h1")).toHaveText("Say hello tosomeone new");
  await expect(page.locator("#start-conversation")).toBeVisible();
  await expect(page.locator("#open-app")).toBeVisible();
  await expect(page.locator(".landing-nav span")).toHaveText(["Home", "Chat Rooms", "Blog", "Guidelines"]);
  await expect(page.locator(".login-link")).toBeVisible();
  await page.locator(".landing-nav span").nth(1).click();
  await expect(page.locator("#landing")).toBeVisible();
  await page.locator(".login-link").click();
  await expect(page.locator("#landing")).toBeVisible();
});

test("landing calls to action open the existing matchmaking entry flow", async ({ page }) => {
  await page.goto("/");
  await page.locator("#start-conversation").click();
  await expect(page.locator("#welcome")).toBeVisible();
  await expect(page.locator("#start-form")).toBeVisible();
  await page.reload();
  await page.locator("#open-app").click();
  await expect(page.locator("#welcome")).toBeVisible();
});

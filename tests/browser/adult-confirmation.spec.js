import { test, expect } from "@playwright/test";

test("adult confirmation is remembered after the first acceptance", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#connection-label")).toHaveText("ONLINE", { timeout: 15000 });

  await page.locator("#start-button").click();
  await expect(page.locator("#adult-dialog")).toBeVisible();
  await page.locator("#confirm-adult").click();
  await expect(page.locator("#searching")).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("weilchat:adult-confirmed:v1"))).toBe("true");

  await page.reload();
  await expect(page.locator("#connection-label")).toHaveText("ONLINE", { timeout: 15000 });
  await page.locator("#start-button").click();

  await expect(page.locator("#adult-dialog")).not.toBeVisible();
  await expect(page.locator("#searching")).toBeVisible();
});

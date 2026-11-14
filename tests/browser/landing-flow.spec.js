import { test, expect } from "@playwright/test";

test("landing page leads to a separate gender step and then connection search", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("#landing")).toBeVisible();
  await expect(page.locator("#landing h1")).toHaveText("Say Hello toSomeone New");
  await expect(page.locator(".landing-copy p")).toHaveText(
    "Connect with friendly people from around the world for free. Make lasting friendships and enjoy endless chats in a safe, anonymous space. No sign-ups required"
  );

  for (const label of ["Home", "Chat Rooms", "Blog", "Guidelines"]) {
    await expect(page.locator(".landing-nav").getByText(label, { exact: true })).toBeVisible();
  }
  await expect(page.locator(".login-link")).toHaveText("Log In");
  await expect(page.locator("#connection-label")).toHaveCSS("position", "absolute");
  await expect(page.locator("#open-app")).toBeVisible();

  await page.locator("#start-conversation").click();
  await expect(page.locator("#welcome")).toBeVisible();
  await expect(page.locator("#welcome legend")).toHaveText("First, tell us your gender");
  await expect(page.locator("input[name=gender]")).toHaveCount(2);
  await expect(page.locator("#landing")).toBeHidden();

  await page.locator("label.choice").filter({ hasText: "Female" }).click();
  await page.locator("#start-button").click();
  await expect(page.locator("#adult-dialog")).toBeVisible();
  await page.locator("#confirm-adult").click();
  await expect(page.locator("#searching")).toBeVisible();
});

test("Open App takes the visitor to the gender selection step", async ({ page }) => {
  await page.goto("/");
  await page.locator("#open-app").click();
  await expect(page.locator("#welcome")).toBeVisible();
  await expect(page.locator("#welcome legend")).toHaveText("First, tell us your gender");
});

test("mobile landing header keeps the navigation and app action visible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".landing-nav")).toBeVisible();
  await expect(page.locator(".login-link")).toBeVisible();
  await expect(page.locator("#open-app")).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth
  }));
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
});

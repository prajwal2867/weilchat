import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 45000,
  workers: 1,
  expect: { timeout: 10000 },
  use: {
    baseURL: "http://127.0.0.1:3000",
    headless: true
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:3000/api/health",
    reuseExistingServer: !process.env.CI,
    env: { ...process.env, REDIS_URL: "", WEILCHAT_REDIS_PREFIX: "weilchat:browser-test:" },
    timeout: 30000
  }
});

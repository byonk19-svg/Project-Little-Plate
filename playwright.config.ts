import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  timeout: 60_000,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [
    {
      name: "mobile-chromium",
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium"
      }
    }
  ],
  webServer: {
    command: "pnpm dev",
    env: {
      NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3000",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:56321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH",
      NEXT_PUBLIC_LOCAL_MAIL_URL: "http://127.0.0.1:56324"
    },
    url: "http://127.0.0.1:3000/today",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  },
  outputDir: "test-results"
});

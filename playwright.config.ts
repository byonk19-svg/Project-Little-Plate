import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const recipeImportFixtureDirectory = path.resolve(
  "tests/fixtures/recipe-import"
);
const port = process.env.PLAYWRIGHT_PORT ?? "3000";
const baseURL = `http://localhost:${port}`;
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:56321";
const mailpitUrl =
  process.env.NEXT_PUBLIC_LOCAL_MAIL_URL ?? "http://127.0.0.1:56324";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/recipe-platform.spec.ts",
  fullyParallel: false,
  timeout: 60_000,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
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
      NEXT_PUBLIC_APP_URL: baseURL,
      NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH",
      NEXT_PUBLIC_LOCAL_MAIL_URL: mailpitUrl,
      RECIPE_IMPORT_TEST_FIXTURES: "1",
      RECIPE_IMPORT_TEST_FIXTURE_DIR: recipeImportFixtureDirectory,
      PORT: port
    },
    url: `${baseURL}/today`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  },
  outputDir: "test-results"
});

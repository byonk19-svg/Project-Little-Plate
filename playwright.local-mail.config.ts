import { defineConfig } from "@playwright/test";

import baseConfig from "./playwright.config";

const baseWebServer = Array.isArray(baseConfig.webServer)
  ? baseConfig.webServer[0]
  : baseConfig.webServer;

if (!baseWebServer) {
  throw new Error(
    "The default Playwright web server configuration is required"
  );
}

export default defineConfig({
  ...baseConfig,
  testMatch: "local-email-delivery.configured.ts",
  webServer: {
    ...baseWebServer,
    env: {
      ...baseWebServer.env,
      NEXT_PUBLIC_LOCAL_MAIL_URL: "http://127.0.0.1:56324"
    }
  }
});

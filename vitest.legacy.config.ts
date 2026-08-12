import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(projectRoot, "src") }
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: [
      "src/modules/catalog/**/*.test.{ts,tsx}",
      "src/modules/catalog-import/**/*.test.{ts,tsx}",
      "src/modules/derived/**/*.test.{ts,tsx}",
      "src/modules/eligibility/**/*.test.{ts,tsx}",
      "src/modules/planner/**/*.test.{ts,tsx}",
      "src/modules/reactions/**/*.test.{ts,tsx}",
      "src/modules/storage/**/*.test.{ts,tsx}",
      "src/modules/meals/queries.test.ts"
    ]
  }
});

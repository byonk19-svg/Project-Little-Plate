import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(projectRoot, "src")
    }
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: [
      "src/modules/catalog/**",
      "src/modules/catalog-import/**",
      "src/modules/derived/**",
      "src/modules/eligibility/**",
      "src/modules/planner/**",
      "src/modules/reactions/**",
      "src/modules/storage/**",
      "src/modules/meals/queries.test.ts"
    ],
    coverage: {
      reporter: ["text", "html"]
    }
  }
});

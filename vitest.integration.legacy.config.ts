import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    exclude: ["tests/integration/personal-recipes.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false
  }
});

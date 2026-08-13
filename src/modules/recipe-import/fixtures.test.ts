import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadRecipeImportFixture } from "@/modules/recipe-import/fixtures";

const fixtureDirectory = path.resolve("tests/fixtures/recipe-import");
const originalFixtureMode = process.env.RECIPE_IMPORT_TEST_FIXTURES;
const originalFixtureDirectory = process.env.RECIPE_IMPORT_TEST_FIXTURE_DIR;

afterEach(() => {
  if (originalFixtureMode === undefined) {
    delete process.env.RECIPE_IMPORT_TEST_FIXTURES;
  } else {
    process.env.RECIPE_IMPORT_TEST_FIXTURES = originalFixtureMode;
  }
  if (originalFixtureDirectory === undefined) {
    delete process.env.RECIPE_IMPORT_TEST_FIXTURE_DIR;
  } else {
    process.env.RECIPE_IMPORT_TEST_FIXTURE_DIR = originalFixtureDirectory;
  }
});

describe("recipe import fixtures", () => {
  it("loads an allowlisted fixture only when test mode is enabled", async () => {
    process.env.RECIPE_IMPORT_TEST_FIXTURES = "1";
    process.env.RECIPE_IMPORT_TEST_FIXTURE_DIR = fixtureDirectory;

    await expect(
      loadRecipeImportFixture(
        "https://example.com/.little-plate-test-fixture/single"
      )
    ).resolves.toMatch(/"name":\s*"Fixture Spinach Bites"/);
  });

  it("does not load fixtures when the test-only switch is disabled", async () => {
    delete process.env.RECIPE_IMPORT_TEST_FIXTURES;
    process.env.RECIPE_IMPORT_TEST_FIXTURE_DIR = fixtureDirectory;

    await expect(
      loadRecipeImportFixture(
        "https://example.com/.little-plate-test-fixture/single"
      )
    ).resolves.toBeNull();
  });
});

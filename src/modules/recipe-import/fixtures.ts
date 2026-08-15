import { readFile } from "node:fs/promises";
import path from "node:path";

const fixtureFiles = new Map([
  ["/.little-plate-test-fixture/single", "single.jsonld.html"],
  ["/.little-plate-test-fixture/multi", "multi.jsonld.html"],
  ["/.little-plate-test-fixture/incomplete", "incomplete.html"]
]);

export async function loadRecipeImportFixture(
  sourceUrl: string
): Promise<string | null> {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.RECIPE_IMPORT_TEST_FIXTURES !== "1"
  ) {
    return null;
  }

  const url = new URL(sourceUrl);
  if (url.hostname !== "example.com") return null;

  const fixtureFile = fixtureFiles.get(url.pathname);
  if (!fixtureFile) return null;

  const fixtureDirectory = process.env.RECIPE_IMPORT_TEST_FIXTURE_DIR;
  if (!fixtureDirectory) {
    throw new Error("Recipe import fixture directory is not configured.");
  }

  return readFile(path.join(fixtureDirectory, fixtureFile), "utf8");
}

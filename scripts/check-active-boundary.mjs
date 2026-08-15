import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const legacyModulePattern =
  /from\s+["']@\/modules\/(catalog|eligibility|planner|derived|reactions|storage)\b/;
const legacyNavigationPattern =
  /(?:href\s*:\s*["']\/(?:foods|feeding-setup)|label\s*:\s*["']Foods["'])/;

const activeRoots = [
  "src/app",
  "src/components/navigation",
  "src/components/shell",
  "src/components/network",
  "src/modules/household",
  "src/modules/meals",
  "src/modules/prepared-notes",
  "src/modules/recipe-images",
  "src/modules/recipe-import",
  "src/modules/recipes"
];

const compatibilityRoots = new Set([
  path.normalize("src/app/foods"),
  path.normalize("src/app/feeding-setup")
]);

async function collectSourceFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(root, entry.name);
    const relativePath = path.relative(repositoryRoot, absolutePath);
    const normalizedRelativePath = path.normalize(relativePath);
    if (
      [...compatibilityRoots].some(
        (compatibilityRoot) =>
          normalizedRelativePath === compatibilityRoot ||
          normalizedRelativePath.startsWith(`${compatibilityRoot}${path.sep}`)
      )
    ) {
      continue;
    }
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(absolutePath)));
    } else if (/\.(?:ts|tsx)$/.test(entry.name)) {
      files.push({
        file: relativePath.split(path.sep).join("/"),
        contents: await readFile(absolutePath, "utf8")
      });
    }
  }
  return files;
}

export function findBoundaryViolations(files) {
  const violations = [];
  for (const entry of files) {
    if (legacyModulePattern.test(entry.contents)) {
      violations.push(`${entry.file}: imports legacy module`);
    }
    if (
      entry.file.startsWith("src/components/navigation/") &&
      legacyNavigationPattern.test(entry.contents)
    ) {
      violations.push(`${entry.file}: exposes legacy navigation`);
    }
  }
  return violations;
}

export async function checkActiveBoundary() {
  const files = [];
  for (const relativeRoot of activeRoots) {
    files.push(
      ...(await collectSourceFiles(path.join(repositoryRoot, relativeRoot)))
    );
  }
  return findBoundaryViolations(files);
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) {
  const violations = await checkActiveBoundary();
  if (violations.length > 0) {
    console.error("Active recipe boundary violations:");
    for (const violation of violations) console.error(`- ${violation}`);
    process.exitCode = 1;
  } else {
    console.log("Active recipe boundary is clean.");
  }
}

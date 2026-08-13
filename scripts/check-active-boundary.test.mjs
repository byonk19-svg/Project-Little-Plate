import test from "node:test";
import assert from "node:assert/strict";

import { findBoundaryViolations } from "./check-active-boundary.mjs";

test("accepts active files without legacy imports or legacy navigation labels", () => {
  assert.deepEqual(
    findBoundaryViolations([
      {
        file: "src/app/recipes/page.tsx",
        contents: 'import { getRecipes } from "@/modules/recipes/queries";'
      },
      {
        file: "src/components/navigation/destinations.ts",
        contents: '{ href: "/recipes", label: "Recipes" }'
      }
    ]),
    []
  );
});

test("reports a legacy import and legacy navigation label in active files", () => {
  assert.deepEqual(
    findBoundaryViolations([
      {
        file: "src/app/week/page.tsx",
        contents: 'import { generateWeek } from "@/modules/planner/generation";'
      },
      {
        file: "src/components/navigation/destinations.ts",
        contents: '{ href: "/foods", label: "Foods" }'
      }
    ]),
    [
      "src/app/week/page.tsx: imports legacy module",
      "src/components/navigation/destinations.ts: exposes legacy navigation"
    ]
  );
});

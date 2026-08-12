import { describe, expect, test } from "vitest";

import {
  buildImportPreview,
  selectReviewedImportDrafts
} from "@/modules/recipe-import/workflow";

describe("recipe import workflow", () => {
  test("preview exposes normalized drafts without raw source markup", () => {
    const preview = buildImportPreview({
      title: "Oats",
      description: "Simple oats",
      ingredients: "1 cup oats",
      instructions: "Cook",
      prepMinutes: "5",
      cookMinutes: "10",
      servings: "2",
      sourceUrl: "https://example.com/oats",
      sourceTitle: "Example",
      tags: "breakfast",
      suggestedImageUrl: null
    });

    expect(preview).toEqual({
      title: "Oats",
      description: "Simple oats",
      ingredients: "1 cup oats",
      instructions: "Cook",
      prepMinutes: "5",
      cookMinutes: "10",
      servings: "2",
      sourceUrl: "https://example.com/oats",
      sourceTitle: "Example",
      tags: "breakfast",
      suggestedImageUrl: null,
      existingMatches: []
    });
    expect(preview).not.toHaveProperty("html");
  });

  test("save selection excludes duplicates unless a separate copy is explicit", () => {
    expect(
      selectReviewedImportDrafts([
        { index: 0, knownDuplicate: true, allowDuplicate: false },
        { index: 1, knownDuplicate: true, allowDuplicate: true },
        { index: 2, knownDuplicate: false, allowDuplicate: false }
      ])
    ).toEqual({ selectedIndexes: [1, 2], duplicateIndexes: [0] });
  });
});

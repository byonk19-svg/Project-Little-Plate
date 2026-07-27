import { execSync } from "node:child_process";

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

const fixture = {
  sources: [
    {
      id: "source-e2e-001",
      publisher: "Synthetic browser fixture publisher",
      title: "Synthetic browser fixture source",
      url: "https://example.test/browser-source",
      source_date: "2026-01-01",
      accessed_at: "2026-07-27"
    }
  ],
  tags: [
    { id: "skill-e2e-001", kind: "skill", label: "Synthetic browser skill" },
    {
      id: "allergen-e2e-none",
      kind: "allergen",
      label: "Synthetic browser allergen marker"
    }
  ],
  foods: [
    {
      id: "food-e2e-001",
      slug: "synthetic-browser-food",
      name: "Synthetic Browser Food",
      category: "test-fixture"
    }
  ],
  preparations: [
    {
      id: "prep-e2e-supported",
      food_id: "food-e2e-001",
      slug: "synthetic-browser-supported",
      name: "Synthetic Browser Supported",
      is_active: true
    },
    {
      id: "prep-e2e-unsupported",
      food_id: "food-e2e-001",
      slug: "synthetic-browser-unsupported",
      name: "Synthetic Browser Unsupported",
      is_active: true
    },
    {
      id: "prep-e2e-draft",
      food_id: "food-e2e-001",
      slug: "synthetic-browser-draft",
      name: "Synthetic Browser Draft",
      is_active: true
    }
  ],
  revisions: [
    {
      id: "revision-e2e-supported-v1",
      preparation_id: "prep-e2e-supported",
      version: 1,
      status: "approved",
      method: "TEST BROWSER METHOD",
      shape_texture: "TEST BROWSER TEXTURE",
      source_id: "source-e2e-001",
      reviewer_role: "synthetic_browser_reviewer",
      reviewed_at: "2026-07-27",
      approved_at: "2026-07-27",
      next_review_at: "2027-07-27",
      tag_ids: ["skill-e2e-001", "allergen-e2e-none"],
      storage_rules: [
        {
          id: "rule-e2e-discard",
          support_status: "supported",
          deadline_kind: "discard_after",
          duration_hours: 24,
          guidance: "TEST BROWSER DISCARD GUIDANCE"
        },
        {
          id: "rule-e2e-quality",
          support_status: "supported",
          deadline_kind: "quality_by",
          duration_hours: 12,
          guidance: "TEST BROWSER QUALITY GUIDANCE"
        }
      ]
    },
    {
      id: "revision-e2e-unsupported-v1",
      preparation_id: "prep-e2e-unsupported",
      version: 1,
      status: "approved",
      method: "TEST BROWSER METHOD",
      shape_texture: "TEST BROWSER TEXTURE",
      source_id: "source-e2e-001",
      reviewer_role: "synthetic_browser_reviewer",
      reviewed_at: "2026-07-27",
      approved_at: "2026-07-27",
      next_review_at: "2027-07-27",
      tag_ids: ["skill-e2e-001", "allergen-e2e-none"],
      storage_rules: [
        {
          id: "rule-e2e-unsupported",
          support_status: "unsupported",
          deadline_kind: null,
          duration_hours: null,
          guidance: null
        }
      ]
    },
    {
      id: "revision-e2e-draft-v1",
      preparation_id: "prep-e2e-draft",
      version: 1,
      status: "draft",
      method: "TEST BROWSER METHOD",
      shape_texture: "TEST BROWSER TEXTURE",
      source_id: "source-e2e-001",
      reviewer_role: null,
      reviewed_at: null,
      approved_at: null,
      next_review_at: null,
      tag_ids: ["skill-e2e-001", "allergen-e2e-none"],
      storage_rules: [
        {
          id: "rule-e2e-draft",
          support_status: "unsupported",
          deadline_kind: null,
          duration_hours: null,
          guidance: null
        }
      ]
    }
  ],
  retirements: []
} as const;

test.beforeAll(async () => {
  const status = JSON.parse(
    execSync("pnpm exec supabase status -o json", { encoding: "utf8" })
  ) as { API_URL: string; SERVICE_ROLE_KEY: string };
  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const result = await admin.rpc("import_catalog_fixture", {
    p_fixture: fixture
  });

  expect(result.error).toBeNull();
});

test("Foods exposes only published preparations and reviewed provenance", async ({
  page
}) => {
  await page.goto("/foods");

  await expect(
    page.getByRole("link", { name: /Synthetic Browser Supported/ })
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Synthetic Browser Unsupported/ })
  ).toBeVisible();
  await expect(page.getByText("Synthetic Browser Draft")).toHaveCount(0);

  await expect(
    page.getByRole("link", { name: /Synthetic Browser Supported/ })
  ).toHaveAttribute("href", "/foods/synthetic-browser-supported");
  await page.goto("/foods/synthetic-browser-supported");

  await expect(
    page.getByRole("heading", {
      name: "Synthetic Browser Supported",
      level: 1
    })
  ).toBeVisible();
  await expect(page.getByText("TEST BROWSER METHOD")).toBeVisible();
  await expect(page.getByText("TEST BROWSER TEXTURE")).toBeVisible();
  await expect(page.getByText("Synthetic browser skill")).toBeVisible();
  await expect(
    page.getByText("Synthetic browser allergen marker")
  ).toBeVisible();
  await expect(
    page.getByText("Synthetic browser fixture source")
  ).toBeVisible();
  await expect(page.getByText("synthetic_browser_reviewer")).toBeVisible();

  const discard = page.getByRole("region", {
    name: "Discard-after safety deadline"
  });
  const quality = page.getByRole("region", { name: "Quality guidance" });
  await expect(discard.getByText("24 hours")).toBeVisible();
  await expect(quality.getByText("12 hours")).toBeVisible();
});

test("unsupported storage and unpublished routes fail safely", async ({
  page
}) => {
  await page.goto("/foods/synthetic-browser-unsupported");

  await expect(
    page.getByText("Reviewed storage guidance is unavailable")
  ).toBeVisible();
  await expect(page.getByText(/hours/)).toHaveCount(0);

  const response = await page.goto("/foods/synthetic-browser-draft");
  expect(response?.status()).toBe(404);
});

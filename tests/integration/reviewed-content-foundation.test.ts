import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  type LocalSupabaseStatus,
  readLocalSupabaseStatus
} from "./support/local-supabase";

const validFixture = {
  sources: [
    {
      id: "source-test-001",
      publisher: "Synthetic fixture publisher",
      title: "Synthetic fixture source",
      url: "https://example.test/source",
      source_date: "2026-01-01",
      accessed_at: "2026-07-27"
    }
  ],
  tags: [
    { id: "skill-test-001", kind: "skill", label: "Synthetic test skill" },
    {
      id: "allergen-test-none",
      kind: "allergen",
      label: "Synthetic no-allergen marker"
    }
  ],
  foods: [
    {
      id: "food-test-001",
      slug: "synthetic-test-food",
      name: "Synthetic Test Food",
      category: "test-fixture"
    }
  ],
  preparations: [
    {
      id: "prep-test-supported",
      food_id: "food-test-001",
      slug: "synthetic-supported",
      name: "Synthetic Supported Preparation",
      is_active: true
    },
    {
      id: "prep-test-unsupported",
      food_id: "food-test-001",
      slug: "synthetic-unsupported",
      name: "Synthetic Unsupported Preparation",
      is_active: true
    },
    {
      id: "prep-test-draft",
      food_id: "food-test-001",
      slug: "synthetic-draft",
      name: "Synthetic Draft Preparation",
      is_active: true
    },
    {
      id: "prep-test-review",
      food_id: "food-test-001",
      slug: "synthetic-in-review",
      name: "Synthetic In-review Preparation",
      is_active: true
    },
    {
      id: "prep-test-retired",
      food_id: "food-test-001",
      slug: "synthetic-retired",
      name: "Synthetic Retired Preparation",
      is_active: true
    },
    {
      id: "prep-test-inactive",
      food_id: "food-test-001",
      slug: "synthetic-inactive",
      name: "Synthetic Inactive Preparation",
      is_active: false
    }
  ],
  revisions: [
    {
      id: "revision-test-supported-v1",
      preparation_id: "prep-test-supported",
      version: 1,
      status: "approved",
      method: "TEST FIXTURE METHOD",
      shape_texture: "TEST FIXTURE TEXTURE",
      source_id: "source-test-001",
      reviewer_role: "synthetic_test_reviewer",
      reviewed_at: "2026-07-27",
      approved_at: "2026-07-27",
      next_review_at: "2027-07-27",
      tag_ids: ["skill-test-001", "allergen-test-none"],
      visual_required: false,
      visual_ids: [],
      preparation_time_band: "under_15_minutes",
      storage_rules: [
        {
          id: "rule-test-discard",
          support_status: "supported",
          deadline_kind: "discard_after",
          duration_hours: 24,
          guidance: "TEST FIXTURE DISCARD GUIDANCE"
        },
        {
          id: "rule-test-quality",
          support_status: "supported",
          deadline_kind: "quality_by",
          duration_hours: 12,
          guidance: "TEST FIXTURE QUALITY GUIDANCE"
        }
      ]
    },
    {
      id: "revision-test-unsupported-v1",
      preparation_id: "prep-test-unsupported",
      version: 1,
      status: "approved",
      method: "TEST FIXTURE METHOD",
      shape_texture: "TEST FIXTURE TEXTURE",
      source_id: "source-test-001",
      reviewer_role: "synthetic_test_reviewer",
      reviewed_at: "2026-07-27",
      approved_at: "2026-07-27",
      next_review_at: "2027-07-27",
      tag_ids: ["skill-test-001", "allergen-test-none"],
      visual_required: false,
      visual_ids: [],
      preparation_time_band: "under_15_minutes",
      storage_rules: [
        {
          id: "rule-test-unsupported",
          support_status: "unsupported",
          deadline_kind: null,
          duration_hours: null,
          guidance: null
        }
      ]
    },
    {
      id: "revision-test-draft-v1",
      preparation_id: "prep-test-draft",
      version: 1,
      status: "draft",
      method: "TEST FIXTURE METHOD",
      shape_texture: "TEST FIXTURE TEXTURE",
      source_id: "source-test-001",
      reviewer_role: null,
      reviewed_at: null,
      approved_at: null,
      next_review_at: null,
      tag_ids: ["skill-test-001", "allergen-test-none"],
      visual_required: false,
      visual_ids: [],
      preparation_time_band: "under_15_minutes",
      storage_rules: [
        {
          id: "rule-test-draft",
          support_status: "unsupported",
          deadline_kind: null,
          duration_hours: null,
          guidance: null
        }
      ]
    },
    {
      id: "revision-test-review-v1",
      preparation_id: "prep-test-review",
      version: 1,
      status: "in_review",
      method: "TEST FIXTURE METHOD",
      shape_texture: "TEST FIXTURE TEXTURE",
      source_id: "source-test-001",
      reviewer_role: "synthetic_test_reviewer",
      reviewed_at: "2026-07-27",
      approved_at: null,
      next_review_at: null,
      tag_ids: ["skill-test-001", "allergen-test-none"],
      visual_required: false,
      visual_ids: [],
      preparation_time_band: "under_15_minutes",
      storage_rules: [
        {
          id: "rule-test-review",
          support_status: "unsupported",
          deadline_kind: null,
          duration_hours: null,
          guidance: null
        }
      ]
    },
    {
      id: "revision-test-retired-v1",
      preparation_id: "prep-test-retired",
      version: 1,
      status: "approved",
      method: "TEST FIXTURE METHOD",
      shape_texture: "TEST FIXTURE TEXTURE",
      source_id: "source-test-001",
      reviewer_role: "synthetic_test_reviewer",
      reviewed_at: "2026-07-27",
      approved_at: "2026-07-27",
      next_review_at: "2027-07-27",
      tag_ids: ["skill-test-001", "allergen-test-none"],
      visual_required: false,
      visual_ids: [],
      preparation_time_band: "under_15_minutes",
      storage_rules: [
        {
          id: "rule-test-retired",
          support_status: "unsupported",
          deadline_kind: null,
          duration_hours: null,
          guidance: null
        }
      ]
    },
    {
      id: "revision-test-inactive-v1",
      preparation_id: "prep-test-inactive",
      version: 1,
      status: "approved",
      method: "TEST FIXTURE METHOD",
      shape_texture: "TEST FIXTURE TEXTURE",
      source_id: "source-test-001",
      reviewer_role: "synthetic_test_reviewer",
      reviewed_at: "2026-07-27",
      approved_at: "2026-07-27",
      next_review_at: "2027-07-27",
      tag_ids: ["skill-test-001", "allergen-test-none"],
      visual_required: false,
      visual_ids: [],
      preparation_time_band: "under_15_minutes",
      storage_rules: [
        {
          id: "rule-test-inactive",
          support_status: "unsupported",
          deadline_kind: null,
          duration_hours: null,
          guidance: null
        }
      ]
    }
  ],
  retirements: [
    {
      revision_id: "revision-test-retired-v1",
      retired_at: "2026-07-27",
      reason: "Synthetic retirement fixture"
    }
  ]
} as const;

type MutableFixture = {
  sources: Array<Record<string, unknown>>;
  tags: Array<Record<string, unknown>>;
  foods: Array<Record<string, unknown> & { id: string }>;
  preparations: Array<
    Record<string, unknown> & { id: string; food_id: string }
  >;
  revisions: Array<
    Record<string, unknown> & {
      id: string;
      preparation_id: string;
      source_id: string;
      reviewer_role: string | null;
      tag_ids: string[];
      storage_rules: Array<Record<string, unknown>>;
    }
  >;
  retirements: Array<Record<string, unknown>>;
};

describe("reviewed content foundation", () => {
  let status: LocalSupabaseStatus;
  let admin: SupabaseClient;
  let anonymous: SupabaseClient;
  let caregiver: SupabaseClient;
  let caregiverId: string;
  let fixtureImported = false;

  beforeAll(async () => {
    status = readLocalSupabaseStatus();
    admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    anonymous = createClient(status.API_URL, status.ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const email = `ticket-03-${crypto.randomUUID()}@example.test`;
    const password = `Ticket-03-${crypto.randomUUID()}`;
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });
    expect(created.error).toBeNull();
    caregiverId = created.data.user!.id;

    const authClient = createClient(status.API_URL, status.ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const signedIn = await authClient.auth.signInWithPassword({
      email,
      password
    });
    expect(signedIn.error).toBeNull();
    caregiver = createClient(status.API_URL, status.ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        headers: {
          Authorization: `Bearer ${signedIn.data.session!.access_token}`
        }
      }
    });
  });

  afterAll(async () => {
    await admin.auth.admin.deleteUser(caregiverId);
    if (!fixtureImported) {
      return;
    }

    const approvedRevisions = [
      "revision-test-supported-v1",
      "revision-test-unsupported-v1"
    ];
    const existingRetirements = await admin
      .from("content_retirements")
      .select("revision_id")
      .in("revision_id", approvedRevisions);
    expect(existingRetirements.error).toBeNull();
    const retiredRevisionIds = new Set(
      (existingRetirements.data ?? []).map(({ revision_id }) => revision_id)
    );
    const missingRetirements = approvedRevisions
      .filter((revisionId) => !retiredRevisionIds.has(revisionId))
      .map((revisionId) => ({
        revision_id: revisionId,
        retired_at: "2026-07-27",
        reason: "SYNTHETIC TEST FIXTURE CLEANUP"
      }));
    if (missingRetirements.length > 0) {
      const retired = await admin
        .from("content_retirements")
        .insert(missingRetirements);
      expect(retired.error).toBeNull();
    }
  });

  test("a valid fixture imports idempotently and only approved active content is published", async () => {
    const first = await admin.rpc("import_catalog_fixture", {
      p_fixture: validFixture
    });
    const retry = await admin.rpc("import_catalog_fixture", {
      p_fixture: validFixture
    });
    fixtureImported = first.error === null;

    expect(first.error).toBeNull();
    expect(retry.error).toBeNull();
    expect(retry.data).toEqual(first.data);

    const published = await anonymous.rpc("list_published_preparations");
    expect(published.error).toBeNull();
    const publishedSlugs = (published.data as Array<{ slug: string }>).map(
      ({ slug }) => slug
    );
    expect(publishedSlugs).toEqual(
      expect.arrayContaining(["synthetic-supported", "synthetic-unsupported"])
    );
    expect(publishedSlugs).not.toEqual(
      expect.arrayContaining([
        "synthetic-draft",
        "synthetic-in-review",
        "synthetic-retired",
        "synthetic-inactive"
      ])
    );

    const revisionCount = await admin
      .from("content_revisions")
      .select("id", { count: "exact", head: true })
      .in(
        "id",
        validFixture.revisions.map(({ id }) => id)
      );
    expect(revisionCount.count).toBe(6);
  });

  test("an approved revision identifier cannot hide changed child content", async () => {
    const changedFixture = structuredClone(
      validFixture
    ) as unknown as MutableFixture;
    changedFixture.revisions[0].storage_rules[0].guidance =
      "CHANGED TEST FIXTURE GUIDANCE";

    const result = await admin.rpc("import_catalog_fixture", {
      p_fixture: changedFixture
    });

    expect(result.error?.message).toMatch(
      /approved revision identifiers cannot be reused/i
    );
  });

  test("an import cannot rewrite parents of approved content", async () => {
    const changedFixture = structuredClone(
      validFixture
    ) as unknown as MutableFixture;
    changedFixture.foods[0].name = "Changed synthetic food";

    const result = await admin.rpc("import_catalog_fixture", {
      p_fixture: changedFixture
    });

    expect(result.error?.message).toMatch(
      /approved content references are append-only/i
    );
  });

  test.each([
    [
      "source",
      /valid source reference/i,
      (fixture: MutableFixture) =>
        (fixture.revisions[0].source_id = "missing-source")
    ],
    [
      "review",
      /complete review metadata/i,
      (fixture: MutableFixture) => (fixture.revisions[0].reviewer_role = null)
    ],
    [
      "allergen",
      /valid allergen reference/i,
      (fixture: MutableFixture) =>
        (fixture.revisions[0].tag_ids = ["skill-test-001"])
    ],
    [
      "skill",
      /valid skill reference/i,
      (fixture: MutableFixture) =>
        (fixture.revisions[0].tag_ids = ["allergen-test-none"])
    ],
    [
      "rule",
      /explicit storage rule reference/i,
      (fixture: MutableFixture) => (fixture.revisions[0].storage_rules = [])
    ]
  ])(
    "rejects an approved fixture with a missing %s reference",
    async (_, expectedError, omit) => {
      const fixture = structuredClone(
        validFixture
      ) as unknown as MutableFixture;
      const uniqueId = crypto.randomUUID();
      fixture.foods[0].id = `invalid-food-${uniqueId}`;
      fixture.foods[0].slug = `invalid-food-${uniqueId}`;
      fixture.preparations[0].food_id = fixture.foods[0].id;
      fixture.preparations[0].id = `invalid-preparation-${uniqueId}`;
      fixture.preparations[0].slug = `invalid-preparation-${uniqueId}`;
      fixture.revisions[0].preparation_id = fixture.preparations[0].id;
      fixture.revisions[0].id = `invalid-revision-${uniqueId}`;
      omit(fixture);

      const result = await admin.rpc("import_catalog_fixture", {
        p_fixture: fixture
      });

      expect(result.error?.message).toMatch(expectedError);
    }
  );

  test("normal users cannot write, publish, import, or retire curated content", async () => {
    const insert = await caregiver.from("sources").insert({
      id: "attacker-source",
      publisher: "attacker",
      title: "attacker",
      url: "https://example.test/attacker",
      source_date: "2026-01-01",
      accessed_at: "2026-07-27"
    });
    expect(insert.error?.code).toBe("42501");

    const importAttempt = await caregiver.rpc("import_catalog_fixture", {
      p_fixture: validFixture
    });
    expect(importAttempt.error?.code).toBe("42501");

    const edit = await caregiver
      .from("foods")
      .update({ name: "Attacker edit" })
      .eq("id", "food-test-001");
    expect(edit.error?.code).toBe("42501");

    const approve = await caregiver
      .from("content_revisions")
      .update({ status: "approved" })
      .eq("id", "revision-test-draft-v1");
    expect(approve.error?.code).toBe("42501");

    const retirement = await caregiver.from("content_retirements").insert({
      revision_id: "revision-test-supported-v1",
      retired_at: "2026-07-27",
      reason: "attacker"
    });
    expect(retirement.error?.code).toBe("42501");
  });

  test("approved revisions are immutable and detail preserves provenance and storage meaning", async () => {
    const mutation = await admin
      .from("content_revisions")
      .update({ method: "MUTATED" })
      .eq("id", "revision-test-supported-v1");
    expect(mutation.error?.message).toMatch(/append-only/i);

    const deletion = await admin
      .from("content_revisions")
      .delete()
      .eq("id", "revision-test-supported-v1");
    expect(deletion.error?.message).toMatch(/append-only/i);

    for (const [table, id, values] of [
      ["sources", "source-test-001", { title: "MUTATED" }],
      ["tags", "skill-test-001", { label: "MUTATED" }],
      ["foods", "food-test-001", { name: "MUTATED" }],
      ["preparations", "prep-test-supported", { name: "MUTATED" }]
    ] as const) {
      const parentMutation = await admin
        .from(table)
        .update(values)
        .eq("id", id);
      expect(parentMutation.error?.message).toMatch(/append-only/i);
    }

    const detail = await anonymous.rpc("get_published_preparation", {
      p_slug: "synthetic-supported"
    });
    expect(detail.error).toBeNull();
    expect(detail.data).toEqual(
      expect.objectContaining({
        food_name: "Synthetic Test Food",
        preparation_name: "Synthetic Supported Preparation",
        method: "TEST FIXTURE METHOD",
        shape_texture: "TEST FIXTURE TEXTURE",
        reviewer_role: "synthetic_test_reviewer",
        source: expect.objectContaining({
          publisher: "Synthetic fixture publisher"
        }),
        tags: expect.arrayContaining([
          expect.objectContaining({ kind: "skill" }),
          expect.objectContaining({ kind: "allergen" })
        ]),
        storage_rules: expect.arrayContaining([
          expect.objectContaining({ deadline_kind: "discard_after" }),
          expect.objectContaining({ deadline_kind: "quality_by" })
        ])
      })
    );

    const unsupported = await anonymous.rpc("get_published_preparation", {
      p_slug: "synthetic-unsupported"
    });
    expect(unsupported.data.storage_rules).toEqual([
      expect.objectContaining({
        support_status: "unsupported",
        deadline_kind: null,
        duration_hours: null
      })
    ]);
  });
});

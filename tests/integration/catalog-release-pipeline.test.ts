import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  authenticatedClient,
  type LocalSupabaseStatus,
  readLocalSupabaseStatus,
  waitForAuth
} from "./support/local-supabase";

const fixtureId = crypto.randomUUID();
const sourceId = `source-ticket-17-${fixtureId}`;
const skillId = `skill-ticket-17-${fixtureId}`;
const allergenId = `allergen-ticket-17-${fixtureId}`;
const execFileAsync = promisify(execFile);

async function runDatabaseCommand(sql: string): Promise<void> {
  await execFileAsync("docker", [
    "exec",
    "supabase_db_mealboard-baby",
    "psql",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    sql
  ]);
}

function catalogFixture(
  count: number,
  options: {
    prefix?: string;
    nextReviewAt?: string;
    status?: "draft" | "in_review" | "approved";
    preparationTimeBand?:
      "under_15_minutes" | "15_to_30_minutes" | "over_30_minutes";
    requireFirstVisual?: boolean;
    includeFirstVisual?: boolean;
  } = {}
) {
  const prefix = options.prefix ?? `ticket-17-${fixtureId}`;
  const revisions = Array.from({ length: count }, (_, index) => ({
    id: `revision-${prefix}-${index}`,
    preparation_id: `preparation-${prefix}-${index}`,
    version: 1,
    status: options.status ?? "approved",
    method: "SYNTHETIC REVIEWED TEST METHOD",
    shape_texture: "SYNTHETIC REVIEWED TEST TEXTURE",
    source_id: sourceId,
    reviewer_role: "synthetic_catalog_reviewer",
    reviewed_at: "2026-07-29",
    approved_at: "2026-07-29",
    next_review_at: options.nextReviewAt ?? "2027-07-29",
    preparation_time_band: options.preparationTimeBand ?? "under_15_minutes",
    tag_ids: [skillId, allergenId],
    storage_rules: [
      index % 2 === 0
        ? {
            id: `rule-${prefix}-${index}`,
            support_status: "supported",
            deadline_kind: "discard_after",
            duration_hours: 24,
            guidance: "SYNTHETIC REVIEWED TEST STORAGE GUIDANCE"
          }
        : {
            id: `rule-${prefix}-${index}`,
            support_status: "unsupported",
            deadline_kind: null,
            duration_hours: null,
            guidance: null
          }
    ],
    visual_required: options.requireFirstVisual === true && index === 0,
    visual_ids:
      options.includeFirstVisual === true && index === 0
        ? [`visual-${prefix}-0`]
        : []
  }));

  return {
    sources: [
      {
        id: sourceId,
        publisher: "Synthetic catalog pipeline publisher",
        title: "Synthetic catalog pipeline source",
        url: "https://example.test/ticket-17",
        source_date: "2026-01-01",
        accessed_at: "2026-07-29"
      }
    ],
    tags: [
      { id: skillId, kind: "skill", label: "Synthetic catalog skill" },
      {
        id: allergenId,
        kind: "allergen",
        label: "Synthetic catalog allergen marker"
      }
    ],
    foods: Array.from({ length: count }, (_, index) => ({
      id: `food-${prefix}-${index}`,
      slug: `food-${prefix}-${index}`,
      name: `Synthetic catalog food ${String(index).padStart(2, "0")}`,
      category: index % 2 === 0 ? "synthetic-fruit" : "synthetic-vegetable"
    })),
    preparations: Array.from({ length: count }, (_, index) => ({
      id: `preparation-${prefix}-${index}`,
      food_id: `food-${prefix}-${index}`,
      slug: `preparation-${prefix}-${index}`,
      name: `Synthetic preparation ${String(index).padStart(2, "0")}`,
      is_active: true
    })),
    revisions,
    retirements: [],
    visuals:
      options.includeFirstVisual === true
        ? [
            {
              id: `visual-${prefix}-0`,
              asset_reference: "/synthetic/catalog-visual-0.webp",
              rights_basis: "original",
              rights_holder: "Synthetic test fixture",
              license_name: null,
              license_url: null,
              alt_text: "Synthetic test visual showing the catalog preparation",
              reviewed_at: "2026-07-29"
            }
          ]
        : []
  };
}

function catalogVisual(prefix: string, suffix: string) {
  return {
    id: `visual-${prefix}-${suffix}`,
    asset_reference: `/synthetic/catalog-visual-${suffix}.webp`,
    rights_basis: "original",
    rights_holder: "Synthetic test fixture",
    license_name: null,
    license_url: null,
    alt_text: `Synthetic test visual ${suffix} showing the catalog preparation`,
    reviewed_at: "2026-07-29"
  };
}

describe("catalog release pipeline", () => {
  let status: LocalSupabaseStatus;
  let admin: SupabaseClient;
  let anonymous: SupabaseClient;
  let createdUserId: string | null = null;
  const importedRevisionIds: string[] = [];

  beforeAll(async () => {
    status = readLocalSupabaseStatus();
    await waitForAuth(status);
    admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    anonymous = createClient(status.API_URL, status.ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  });

  afterAll(async () => {
    if (createdUserId) {
      const deleted = await admin.auth.admin.deleteUser(createdUserId);
      expect(deleted.error).toBeNull();
    }
    if (importedRevisionIds.length === 0) return;
    const retired = await admin.from("content_retirements").insert(
      importedRevisionIds.map((revisionId) => ({
        revision_id: revisionId,
        retired_at: "2026-07-29",
        reason: "SYNTHETIC TICKET 17 TEST CLEANUP"
      }))
    );
    expect(retired.error).toBeNull();
  });

  test("imports a 50-food synthetic catalog and reports only structural candidate evidence", async () => {
    const fixture = catalogFixture(50, {
      requireFirstVisual: true,
      includeFirstVisual: true
    });
    fixture.revisions[0].version = 2;
    const imported = await admin.rpc("import_catalog_fixture", {
      p_fixture: fixture
    });
    expect(imported.error).toBeNull();
    importedRevisionIds.push(...fixture.revisions.map(({ id }) => id));

    const report = await admin.rpc("get_catalog_release_report", {
      p_as_of: "2026-07-30"
    });
    expect(report.error).toBeNull();
    expect(report.data).toEqual(
      expect.objectContaining({
        structural_candidate_food_count: 50,
        structural_target_minimum: 40,
        structural_target_maximum: 60,
        structural_target_shape_met: true,
        beta_ready: false,
        external_approval_status: "not_recorded",
        overdue_revision_ids: [],
        visual_requirement_missing_revision_ids: []
      })
    );

    const retry = await admin.rpc("import_catalog_fixture", {
      p_fixture: fixture
    });
    expect(retry.error).toBeNull();
    expect(retry.data).toEqual(imported.data);

    const legacyPrefix = `ticket-17-legacy-${fixtureId}`;
    const legacyFixture = catalogFixture(1, { prefix: legacyPrefix });
    delete (
      legacyFixture.revisions[0] as {
        visual_required?: boolean;
      }
    ).visual_required;
    delete (
      legacyFixture.revisions[0] as {
        preparation_time_band?: string;
      }
    ).preparation_time_band;
    const legacyJson = JSON.stringify(legacyFixture).replaceAll("'", "''");
    await runDatabaseCommand(
      `select public.import_catalog_fixture_unchecked('${legacyJson}'::jsonb);`
    );
    importedRevisionIds.push(legacyFixture.revisions[0].id);

    const supersededRevision = {
      ...structuredClone(fixture),
      foods: [fixture.foods[0]],
      preparations: [fixture.preparations[0]],
      revisions: [
        {
          ...fixture.revisions[0],
          id: `revision-${legacyPrefix}-superseded`,
          version: 1,
          storage_rules: fixture.revisions[0].storage_rules.map((rule) => ({
            ...rule,
            id: `${rule.id}-superseded`
          }))
        }
      ],
      visuals: []
    };
    delete (
      supersededRevision.revisions[0] as {
        visual_required?: boolean;
      }
    ).visual_required;
    delete (
      supersededRevision.revisions[0] as {
        preparation_time_band?: string;
      }
    ).preparation_time_band;
    const supersededJson = JSON.stringify(supersededRevision).replaceAll(
      "'",
      "''"
    );
    await runDatabaseCommand(
      `select public.import_catalog_fixture_unchecked('${supersededJson}'::jsonb);`
    );
    importedRevisionIds.push(supersededRevision.revisions[0].id);

    const reportWithLegacyRevision = await admin.rpc(
      "get_catalog_release_report",
      { p_as_of: "2026-07-30" }
    );
    expect(reportWithLegacyRevision.error).toBeNull();
    expect(
      reportWithLegacyRevision.data.visual_requirement_missing_revision_ids
    ).toEqual([legacyFixture.revisions[0].id]);
    expect(reportWithLegacyRevision.data.structural_candidate_food_count).toBe(
      50
    );

    const catalog = await anonymous.rpc("list_published_catalog_items");
    expect(catalog.error).toBeNull();
    expect(catalog.data).toHaveLength(50);
    expect(catalog.data[0]).toEqual(
      expect.objectContaining({
        category: "synthetic-fruit",
        skill_labels: ["Synthetic catalog skill"],
        allergen_labels: ["Synthetic catalog allergen marker"],
        familiarity: "unknown",
        skill_compatibility: "unknown",
        preparation_time_band: "under_15_minutes"
      })
    );

    const detail = await anonymous.rpc("get_published_preparation", {
      p_slug: fixture.preparations[0].slug
    });
    expect(detail.error).toBeNull();
    expect(detail.data.visuals).toEqual([
      expect.objectContaining({
        asset_reference: "/synthetic/catalog-visual-0.webp",
        rights_basis: "original",
        alt_text: "Synthetic test visual showing the catalog preparation"
      })
    ]);
  });

  test("rejects overdue new publication and missing required visuals atomically", async () => {
    const overdue = catalogFixture(1, {
      prefix: `ticket-17-overdue-${fixtureId}`,
      nextReviewAt: "2026-07-28"
    });
    const overdueImport = await admin.rpc("import_catalog_fixture", {
      p_fixture: overdue
    });
    expect(overdueImport.error?.message).toContain(
      "overdue for new publication"
    );
    expect(
      (
        await admin
          .from("foods")
          .select("id", { count: "exact", head: true })
          .eq("id", overdue.foods[0].id)
      ).count
    ).toBe(0);

    const nullVisualRequirement = catalogFixture(1, {
      prefix: `ticket-17-null-visual-${fixtureId}`
    });
    (
      nullVisualRequirement.revisions[0] as {
        visual_required: boolean | null;
      }
    ).visual_required = null;
    const nullVisualImport = await admin.rpc("import_catalog_fixture", {
      p_fixture: nullVisualRequirement
    });
    expect(nullVisualImport.error?.message).toContain(
      "explicit visual requirement"
    );

    const blankReviewerRole = catalogFixture(1, {
      prefix: `ticket-17-blank-reviewer-${fixtureId}`
    });
    blankReviewerRole.revisions[0].reviewer_role = "   ";
    const blankReviewerImport = await admin.rpc("import_catalog_fixture", {
      p_fixture: blankReviewerRole
    });
    expect(blankReviewerImport.error?.message).toContain(
      "complete review metadata"
    );
    expect(
      (
        await admin
          .from("foods")
          .select("id", { count: "exact", head: true })
          .eq("id", blankReviewerRole.foods[0].id)
      ).count
    ).toBe(0);

    const malformedLicense = catalogFixture(1, {
      prefix: `ticket-17-malformed-license-${fixtureId}`,
      includeFirstVisual: true
    });
    const malformedVisual = malformedLicense.visuals[0] as {
      rights_basis: "original" | "licensed";
      license_name: string | null;
      license_url: string | null;
    };
    malformedVisual.rights_basis = "licensed";
    malformedVisual.license_name = "Synthetic license";
    malformedVisual.license_url = "https://";
    const malformedLicenseImport = await admin.rpc("import_catalog_fixture", {
      p_fixture: malformedLicense
    });
    expect(malformedLicenseImport.error?.message).toContain(
      "complete rights and alt-text metadata"
    );

    const missingVisual = catalogFixture(1, {
      prefix: `ticket-17-visual-${fixtureId}`,
      requireFirstVisual: true
    });
    const missingVisualImport = await admin.rpc("import_catalog_fixture", {
      p_fixture: missingVisual
    });
    expect(missingVisualImport.error?.message).toContain(
      "Required visual is missing"
    );
    expect(
      (
        await admin
          .from("foods")
          .select("id", { count: "exact", head: true })
          .eq("id", missingVisual.foods[0].id)
      ).count
    ).toBe(0);

    const undeclaredVisualRequirement = catalogFixture(1, {
      prefix: `ticket-17-undeclared-visual-${fixtureId}`
    });
    delete (
      undeclaredVisualRequirement.revisions[0] as {
        visual_required?: boolean;
      }
    ).visual_required;
    const undeclaredImport = await admin.rpc("import_catalog_fixture", {
      p_fixture: undeclaredVisualRequirement
    });
    expect(undeclaredImport.error?.message).toContain(
      "explicit visual requirement"
    );
    expect(
      (
        await admin
          .from("foods")
          .select("id", { count: "exact", head: true })
          .eq("id", undeclaredVisualRequirement.foods[0].id)
      ).count
    ).toBe(0);

    const missingPreparationTime = catalogFixture(1, {
      prefix: `ticket-17-preparation-time-${fixtureId}`
    });
    delete (
      missingPreparationTime.revisions[0] as {
        preparation_time_band?: string;
      }
    ).preparation_time_band;
    const missingPreparationTimeImport = await admin.rpc(
      "import_catalog_fixture",
      {
        p_fixture: missingPreparationTime
      }
    );
    expect(missingPreparationTimeImport.error?.message).toContain(
      "preparation-time band"
    );

    const nullPreparationTime = catalogFixture(1, {
      prefix: `ticket-17-null-preparation-time-${fixtureId}`
    });
    (
      nullPreparationTime.revisions[0] as {
        preparation_time_band: string | null;
      }
    ).preparation_time_band = null;
    const nullPreparationTimeImport = await admin.rpc(
      "import_catalog_fixture",
      { p_fixture: nullPreparationTime }
    );
    expect(nullPreparationTimeImport.error?.message).toContain(
      "invalid preparation-time band"
    );
  });

  test("allows draft visual evolution and freezes the exact set at approval", async () => {
    const prefix = `ticket-17-lifecycle-${fixtureId}`;
    const draft = catalogFixture(1, {
      prefix,
      status: "draft",
      includeFirstVisual: true
    });
    const visualB = catalogVisual(prefix, "b");
    const visualC = catalogVisual(prefix, "c");

    const firstImport = await admin.rpc("import_catalog_fixture", {
      p_fixture: draft
    });
    expect(firstImport.error).toBeNull();

    const revisedDraft = structuredClone(draft);
    revisedDraft.visuals = [visualB];
    revisedDraft.revisions[0].visual_required = true;
    revisedDraft.revisions[0].visual_ids = [visualB.id];
    revisedDraft.revisions[0].preparation_time_band = "15_to_30_minutes";
    const draftEvolution = await admin.rpc("import_catalog_fixture", {
      p_fixture: revisedDraft
    });
    expect(draftEvolution.error).toBeNull();

    const draftLinks = await admin
      .from("revision_visuals")
      .select("visual_id")
      .eq("revision_id", revisedDraft.revisions[0].id);
    expect(draftLinks.error).toBeNull();
    expect(draftLinks.data).toEqual([{ visual_id: visualB.id }]);

    const approved = structuredClone(revisedDraft);
    approved.revisions[0].status = "approved";
    const approval = await admin.rpc("import_catalog_fixture", {
      p_fixture: approved
    });
    expect(approval.error).toBeNull();
    importedRevisionIds.push(approved.revisions[0].id);

    const exactRetry = await admin.rpc("import_catalog_fixture", {
      p_fixture: approved
    });
    expect(exactRetry.error).toBeNull();

    const addedVisual = structuredClone(approved);
    addedVisual.visuals = [visualB, visualC];
    addedVisual.revisions[0].visual_ids = [visualB.id, visualC.id];
    const addAttempt = await admin.rpc("import_catalog_fixture", {
      p_fixture: addedVisual
    });
    expect(addAttempt.error?.message).toContain(
      "Approved visual associations cannot be rewritten"
    );

    const removedVisual = structuredClone(approved);
    removedVisual.revisions[0].visual_required = false;
    removedVisual.revisions[0].visual_ids = [];
    const removeAttempt = await admin.rpc("import_catalog_fixture", {
      p_fixture: removedVisual
    });
    expect(removeAttempt.error?.message).toContain(
      "Approved visual requirement cannot be rewritten"
    );

    const preparationTimeRewrite = structuredClone(approved);
    preparationTimeRewrite.revisions[0].preparation_time_band =
      "over_30_minutes";
    const preparationTimeRewriteAttempt = await admin.rpc(
      "import_catalog_fixture",
      { p_fixture: preparationTimeRewrite }
    );
    expect(preparationTimeRewriteAttempt.error?.message).toContain(
      "Approved preparation-time band cannot be rewritten"
    );

    const directInsert = await admin.from("revision_visuals").insert({
      revision_id: approved.revisions[0].id,
      visual_id: visualC.id
    });
    expect(directInsert.error?.message).toContain(
      "permission denied for table revision_visuals"
    );
    const directMetadataUpdate = await admin
      .from("revision_catalog_metadata")
      .update({ preparation_time_band: "over_30_minutes" })
      .eq("revision_id", approved.revisions[0].id);
    expect(directMetadataUpdate.error?.message).toContain(
      "permission denied for table revision_catalog_metadata"
    );

    const approvedLinks = await admin
      .from("revision_visuals")
      .select("visual_id")
      .eq("revision_id", approved.revisions[0].id);
    expect(approvedLinks.error).toBeNull();
    expect(approvedLinks.data).toEqual([{ visual_id: visualB.id }]);
  });

  test("source monitoring includes current candidates and excludes draft-only sources", async () => {
    const publishedPrefix = `ticket-17-source-published-${fixtureId}`;
    const published = catalogFixture(1, { prefix: publishedPrefix });
    const draftPrefix = `ticket-17-source-draft-${fixtureId}`;
    const draft = catalogFixture(1, {
      prefix: draftPrefix,
      status: "draft"
    });
    const draftSourceId = `source-${draftPrefix}`;
    draft.sources[0] = {
      ...draft.sources[0],
      id: draftSourceId,
      url: "https://example.test/ticket-17-draft"
    };
    draft.revisions[0].source_id = draftSourceId;

    const publishedImport = await admin.rpc("import_catalog_fixture", {
      p_fixture: published
    });
    expect(publishedImport.error).toBeNull();
    importedRevisionIds.push(published.revisions[0].id);
    const draftImport = await admin.rpc("import_catalog_fixture", {
      p_fixture: draft
    });
    expect(draftImport.error).toBeNull();

    const sources = await admin.rpc("list_catalog_release_sources");
    expect(sources.error).toBeNull();
    expect(sources.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: sourceId,
          url: "https://example.test/ticket-17"
        })
      ])
    );
    expect(sources.data).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: draftSourceId
        })
      ])
    );
  });

  test("derives familiarity and skill compatibility only from the caller profile", async () => {
    const prefix = `ticket-17-context-${fixtureId}`;
    const contextFixture = catalogFixture(1, { prefix });
    contextFixture.foods[0].name = "AAA Synthetic context food";
    const imported = await admin.rpc("import_catalog_fixture", {
      p_fixture: contextFixture
    });
    expect(imported.error).toBeNull();
    importedRevisionIds.push(contextFixture.revisions[0].id);

    const email = `ticket-17-${crypto.randomUUID()}@example.test`;
    const password = `Ticket-17-${crypto.randomUUID()}`;
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });
    expect(created.error).toBeNull();
    createdUserId = created.data.user!.id;

    const signInClient = createClient(status.API_URL, status.ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const signedIn = await signInClient.auth.signInWithPassword({
      email,
      password
    });
    expect(signedIn.error).toBeNull();
    const caregiver = authenticatedClient(
      status,
      signedIn.data.session!.access_token
    );
    expect((await caregiver.rpc("bootstrap_account")).error).toBeNull();
    expect(
      (
        await caregiver.rpc("complete_baby_profile", {
          p_nickname: "Synthetic catalog baby",
          p_birth_date: "2025-10-15",
          p_time_zone: "America/Chicago",
          p_feeding_style: "mixed",
          p_meal_slots: ["breakfast", "dinner"]
        })
      ).error
    ).toBeNull();
    expect(
      (
        await caregiver.rpc("save_feeding_configuration", {
          p_skill_statuses: [{ skill_id: skillId, status: "observed" }],
          p_restrictions: [
            {
              food_id: contextFixture.foods[0].id,
              status: "no_known_restriction"
            }
          ],
          p_exposures: [
            { food_id: contextFixture.foods[0].id, state: "liked" }
          ],
          p_new_food_pace: "one_per_week",
          p_preparation_time: "under_30_minutes",
          p_prep_day: 6,
          p_quick_backup_food_ids: []
        })
      ).error
    ).toBeNull();

    const catalog = await caregiver.rpc("list_published_catalog_items");
    expect(catalog.error).toBeNull();
    expect(
      catalog.data.find(
        (item: { slug: string }) =>
          item.slug === contextFixture.preparations[0].slug
      )
    ).toEqual(
      expect.objectContaining({
        familiarity: "familiar",
        skill_compatibility: "compatible",
        preparation_time_band: "under_15_minutes"
      })
    );
  });
});

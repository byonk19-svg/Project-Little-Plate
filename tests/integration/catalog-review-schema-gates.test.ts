import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, test } from "vitest";

import {
  type LocalSupabaseStatus,
  readLocalSupabaseStatus
} from "./support/local-supabase";

const dimensions = [
  "feeding_safety_developmental",
  "allergy_restriction",
  "nutrition_age_stage",
  "taxonomy_labeling",
  "storage_handling",
  "visual_accessibility_rights"
] as const;
const alwaysRequired = dimensions.slice(0, 5);

type ReviewDimension = (typeof dimensions)[number];

let status: LocalSupabaseStatus;
let admin: SupabaseClient;
let anonymous: SupabaseClient;
let fixtureId: string;
let sourceId: string;
let authorityId: string;
const revisionIds = new Map<string, string>();
const caseRevisionIds = new Map<string, string>();

function id(prefix: string) {
  return `${prefix.replaceAll("_", "-")}-${fixtureId}`;
}

async function rpc<T = unknown>(
  client: SupabaseClient,
  functionName: string,
  args: Record<string, unknown>
) {
  const result = await client.rpc(functionName, args);
  return result as {
    data: T | null;
    error: { message: string; code?: string } | null;
  };
}

async function createCase(
  label: string,
  classification = "production_candidate"
) {
  const caseId = id(`case-${label}`);
  const candidateRevisionId =
    revisionIds.get(label) ?? revisionIds.get("default");
  expect(candidateRevisionId).toBeDefined();
  const created = await rpc(admin, "create_catalog_review_case", {
    p_case_id: caseId,
    p_revision_id: candidateRevisionId,
    p_classification: classification
  });
  expect(created.error).toBeNull();
  caseRevisionIds.set(caseId, candidateRevisionId!);
  return caseId;
}

async function registerAuthority(
  label: string,
  coveredDimensions: readonly ReviewDimension[] = dimensions
) {
  const reference = id(`authority-${label}`);
  const created = await rpc(admin, "register_catalog_reviewer_authority", {
    p_reference: reference,
    p_authority_basis: "Synthetic test authority basis",
    p_evidence_location: `test-only://${reference}`,
    p_dimensions: coveredDimensions
  });
  expect(created.error).toBeNull();
  return reference;
}

async function submit(
  caseId: string,
  dimension: ReviewDimension,
  submissionLabel: string,
  options: {
    decision?: string;
    authorityReference?: string;
    followUpStatus?: string;
    clarificationRequiresCatalogChange?: boolean;
    storageSupportState?: string;
    supersedesSubmissionId?: string;
  } = {}
) {
  const submissionId = id(`submission-${caseId}-${submissionLabel}`);
  const candidateRevisionId = caseRevisionIds.get(caseId);
  expect(candidateRevisionId).toBeDefined();
  const result = await rpc(admin, "submit_catalog_review", {
    p_submission_id: submissionId,
    p_case_id: caseId,
    p_revision_id: candidateRevisionId,
    p_dimension: dimension,
    p_decision: options.decision ?? "Accept",
    p_reviewer_role: "synthetic_test_reviewer",
    p_reviewer_authority_reference: options.authorityReference ?? authorityId,
    p_reviewed_at: "2026-08-03",
    p_follow_up_status: options.followUpStatus ?? "none",
    p_clarification_requires_catalog_change:
      options.clarificationRequiresCatalogChange ?? false,
    p_notes: "Synthetic test review note",
    p_storage_support_state:
      dimension === "storage_handling"
        ? (options.storageSupportState ?? "unknown")
        : null,
    p_storage_context:
      dimension === "storage_handling"
        ? { existing_storage_guidance: "UNKNOWN TEST VALUE" }
        : {},
    p_visual_context:
      dimension === "visual_accessibility_rights"
        ? { visual_reference: "UNKNOWN TEST VALUE" }
        : {},
    p_supersedes_submission_id: options.supersedesSubmissionId ?? null
  });
  expect(result.error).toBeNull();
  return submissionId;
}

async function addEvidence(submissionId: string, label: string) {
  const result = await rpc(admin, "record_catalog_review_evidence", {
    p_evidence_id: id(`evidence-${submissionId}-${label}`),
    p_submission_id: submissionId,
    p_field_or_claim: "test-only claim path",
    p_evidence_reference: `test-only://evidence/${label}`,
    p_source_id: sourceId
  });
  expect(result.error).toBeNull();
}

async function submitCompleteReviews(
  caseId: string,
  options: {
    authorityReference?: string;
    decision?: string;
    clarificationRequiresCatalogChange?: boolean;
    followUpStatus?: string;
  } = {}
) {
  for (const dimension of alwaysRequired) {
    const submissionId = await submit(caseId, dimension, dimension, options);
    await addEvidence(submissionId, dimension);
  }
}

describe("catalog review schema and transition gates", () => {
  beforeAll(async () => {
    status = readLocalSupabaseStatus();
    admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    anonymous = createClient(status.API_URL, status.ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const enumColumns = execFileSync(
      "docker",
      [
        "exec",
        "supabase_db_mealboard-baby",
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-Atc",
        "select table_name || '.' || column_name || '=' || udt_name from information_schema.columns where table_schema='public' and ((table_name='catalog_review_cases' and column_name='status') or (table_name='catalog_review_submissions' and column_name in ('dimension','decision')));"
      ],
      { encoding: "utf8" }
    ).trim();
    expect(enumColumns).toContain(
      "catalog_review_cases.status=catalog_review_case_status"
    );
    expect(enumColumns).toContain(
      "catalog_review_submissions.dimension=catalog_review_dimension"
    );
    expect(enumColumns).toContain(
      "catalog_review_submissions.decision=catalog_review_decision"
    );
    const enumTypes = execFileSync(
      "docker",
      [
        "exec",
        "supabase_db_mealboard-baby",
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-Atc",
        "select typname || '=' || typtype::text from pg_type where typname in ('catalog_review_case_status','catalog_review_dimension','catalog_review_decision');"
      ],
      { encoding: "utf8" }
    ).trim();
    expect(enumTypes.split(/\r?\n/).sort()).toEqual([
      "catalog_review_case_status=e",
      "catalog_review_decision=e",
      "catalog_review_dimension=e"
    ]);
    fixtureId = crypto.randomUUID();
    sourceId = id("source");
    authorityId = await registerAuthority("all");

    const fixture = {
      sources: [
        {
          id: sourceId,
          publisher: "Synthetic Ticket 23A publisher",
          title: "Synthetic Ticket 23A source",
          url: "https://example.test/ticket-23a",
          source_date: "2026-08-03",
          accessed_at: "2026-08-03"
        }
      ],
      tags: [
        { id: id("skill"), kind: "skill", label: "Synthetic Ticket 23A skill" },
        {
          id: id("allergen"),
          kind: "allergen",
          label: "Synthetic Ticket 23A allergen"
        }
      ],
      foods: [
        {
          id: id("food"),
          slug: id("food"),
          name: "Synthetic Ticket 23A Food",
          category: "synthetic-test-fixture"
        }
      ],
      preparations: [
        {
          id: id("preparation"),
          food_id: id("food"),
          slug: id("preparation"),
          name: "Synthetic Ticket 23A Preparation",
          is_active: true
        }
      ],
      revisions: Array.from({ length: 9 }, (_, index) => ({
        id: id(`revision-${index}`),
        preparation_id: id("preparation"),
        version: index + 1,
        status: "draft",
        method: "SYNTHETIC TEST METHOD",
        shape_texture: "SYNTHETIC TEST TEXTURE",
        source_id: sourceId,
        reviewer_role: null,
        reviewed_at: null,
        approved_at: null,
        next_review_at: null,
        tag_ids: [id("skill"), id("allergen")],
        visual_required: index === 8,
        visual_ids: index === 8 ? [id("visual")] : [],
        preparation_time_band: "under_15_minutes",
        storage_rules: [
          {
            id: id(`rule-${index}`),
            support_status: "unsupported",
            deadline_kind: null,
            duration_hours: null,
            guidance: null
          }
        ]
      })),
      retirements: [],
      visuals: [
        {
          id: id("visual"),
          asset_reference: "/synthetic/ticket-23a-visual.webp",
          rights_basis: "original",
          rights_holder: "Synthetic Ticket 23A fixture",
          license_name: null,
          license_url: null,
          alt_text: "Synthetic Ticket 23A visual",
          reviewed_at: "2026-08-03"
        }
      ]
    };
    const imported = await rpc(admin, "import_catalog_fixture", {
      p_fixture: fixture
    });
    expect(imported.error).toBeNull();
    for (const [index, label] of [
      "transitions",
      "conflict",
      "rounds",
      "missing",
      "complete",
      "blocked",
      "clarification",
      "history",
      "visual"
    ].entries()) {
      revisionIds.set(label, id(`revision-${index}`));
    }
    revisionIds.set("default", id("revision-0"));
  });

  test("keeps candidate and review records private", async () => {
    const tableRead = await anonymous.from("catalog_review_cases").select("id");
    expect(tableRead.error?.code).toBe("42501");
    const functionRead = await rpc(
      anonymous,
      "get_catalog_review_eligibility",
      {
        p_case_id: "missing-case"
      }
    );
    expect(functionRead.error?.code).toBe("42501");

    const publicCatalog = await anonymous.rpc("list_published_catalog_items");
    expect(publicCatalog.error).toBeNull();
    expect(publicCatalog.data).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ slug: `preparation-${fixtureId}` })
      ])
    );
    const publicDetail = await anonymous.rpc("get_published_preparation", {
      p_slug: `preparation-${fixtureId}`
    });
    expect(publicDetail.error).toBeNull();
    expect(publicDetail.data).toBeNull();
  });

  test("enforces legal case transitions and rejects direct status updates", async () => {
    const caseId = await createCase("conflict");
    const illegal = await rpc(admin, "transition_catalog_review_case", {
      p_case_id: caseId,
      p_target_status: "in_review",
      p_reason: "skip attempt"
    });
    expect(illegal.error?.message).toMatch(/illegal/i);

    for (const target of ["ready_for_review", "in_review"]) {
      const transition = await rpc(admin, "transition_catalog_review_case", {
        p_case_id: caseId,
        p_target_status: target,
        p_reason: `move to ${target}`
      });
      expect(transition.error).toBeNull();
    }

    const directUpdate = await admin
      .from("catalog_review_cases")
      .update({ status: "completed" })
      .eq("id", caseId);
    expect(directUpdate.error?.code).toBe("42501");
  });

  test("reports deterministic missing-review and authority reasons", async () => {
    const caseId = await createCase("missing");
    await rpc(admin, "transition_catalog_review_case", {
      p_case_id: caseId,
      p_target_status: "ready_for_review",
      p_reason: "ready"
    });
    await rpc(admin, "transition_catalog_review_case", {
      p_case_id: caseId,
      p_target_status: "in_review",
      p_reason: "review started"
    });
    const report = await rpc<{
      eligible: boolean;
      reason_codes: Array<{ code: string }>;
    }>(admin, "get_catalog_review_eligibility", { p_case_id: caseId });
    expect(report.data?.eligible).toBe(false);
    expect(report.data?.reason_codes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "missing_required_dimension" })
      ])
    );

    const partialAuthority = await registerAuthority("partial", [
      "feeding_safety_developmental"
    ]);
    const submissionId = await submit(
      caseId,
      "feeding_safety_developmental",
      "partial",
      {
        authorityReference: partialAuthority
      }
    );
    await addEvidence(submissionId, "partial");
    const updated = await rpc<{ reason_codes: Array<{ code: string }> }>(
      admin,
      "get_catalog_review_eligibility",
      { p_case_id: caseId }
    );
    expect(updated.data?.reason_codes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "missing_required_dimension" })
      ])
    );
  });

  test("requires all five dimensions and handles non-required visual review", async () => {
    const caseId = await createCase("complete");
    await rpc(admin, "transition_catalog_review_case", {
      p_case_id: caseId,
      p_target_status: "ready_for_review",
      p_reason: "ready"
    });
    await rpc(admin, "transition_catalog_review_case", {
      p_case_id: caseId,
      p_target_status: "in_review",
      p_reason: "review started"
    });
    await submitCompleteReviews(caseId);
    const report = await rpc<{ eligible: boolean; reason_codes: unknown[] }>(
      admin,
      "get_catalog_review_eligibility",
      { p_case_id: caseId }
    );
    expect(report.data).toEqual(
      expect.objectContaining({ eligible: true, reason_codes: [] })
    );

    const completed = await rpc(admin, "transition_catalog_review_case", {
      p_case_id: caseId,
      p_target_status: "completed",
      p_reason: "all required reviews complete"
    });
    expect(completed.error).toBeNull();
  });

  test("requires and validates conditional visual review", async () => {
    const caseId = await createCase("visual");
    await rpc(admin, "transition_catalog_review_case", {
      p_case_id: caseId,
      p_target_status: "ready_for_review",
      p_reason: "ready"
    });
    await rpc(admin, "transition_catalog_review_case", {
      p_case_id: caseId,
      p_target_status: "in_review",
      p_reason: "review started"
    });
    await submitCompleteReviews(caseId);
    const missingVisual = await rpc<{ reason_codes: Array<{ code: string }> }>(
      admin,
      "get_catalog_review_eligibility",
      { p_case_id: caseId }
    );
    expect(missingVisual.data?.reason_codes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "missing_conditional_visual_review" })
      ])
    );

    const visualSubmission = await submit(
      caseId,
      "visual_accessibility_rights",
      "visual",
      { authorityReference: authorityId }
    );
    await addEvidence(visualSubmission, "visual");
    const eligible = await rpc<{ eligible: boolean; reason_codes: unknown[] }>(
      admin,
      "get_catalog_review_eligibility",
      { p_case_id: caseId }
    );
    expect(eligible.data).toEqual(
      expect.objectContaining({ eligible: true, reason_codes: [] })
    );
  });

  test("requires a valid owner choice for compatible current reviews", async () => {
    const caseId = await createCase("transitions");
    await rpc(admin, "transition_catalog_review_case", {
      p_case_id: caseId,
      p_target_status: "ready_for_review",
      p_reason: "ready"
    });
    await rpc(admin, "transition_catalog_review_case", {
      p_case_id: caseId,
      p_target_status: "in_review",
      p_reason: "review started"
    });
    const first = await submit(
      caseId,
      "feeding_safety_developmental",
      "conflict-a"
    );
    await addEvidence(first, "conflict-a");
    const second = await submit(
      caseId,
      "feeding_safety_developmental",
      "conflict-b"
    );
    await addEvidence(second, "conflict-b");
    for (const dimension of alwaysRequired.slice(1)) {
      const submissionId = await submit(
        caseId,
        dimension,
        `conflict-${dimension}`
      );
      await addEvidence(submissionId, `conflict-${dimension}`);
    }
    const unresolved = await rpc<{ reason_codes: Array<{ code: string }> }>(
      admin,
      "get_catalog_review_eligibility",
      { p_case_id: caseId }
    );
    expect(unresolved.data?.reason_codes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "conflicting_qualified_reviews" })
      ])
    );

    const adjudication = await rpc(admin, "record_catalog_owner_adjudication", {
      p_adjudication_id: id("adjudication-compatible"),
      p_case_id: caseId,
      p_dimension: "feeding_safety_developmental",
      p_outcome: "select_qualified_recommendation",
      p_selected_submission_id: first,
      p_notes: "Select one compatible qualified recommendation"
    });
    expect(adjudication.error).toBeNull();
    const resolved = await rpc<{ eligible: boolean; reason_codes: unknown[] }>(
      admin,
      "get_catalog_review_eligibility",
      { p_case_id: caseId }
    );
    expect(resolved.data).toEqual(
      expect.objectContaining({ eligible: true, reason_codes: [] })
    );
  });

  test("supports append-only adjudication rounds after review supersession", async () => {
    const caseId = await createCase("rounds");
    await rpc(admin, "transition_catalog_review_case", {
      p_case_id: caseId,
      p_target_status: "ready_for_review",
      p_reason: "ready"
    });
    await rpc(admin, "transition_catalog_review_case", {
      p_case_id: caseId,
      p_target_status: "in_review",
      p_reason: "review started"
    });
    const first = await submit(
      caseId,
      "feeding_safety_developmental",
      "round-a"
    );
    await addEvidence(first, "round-a");
    const second = await submit(
      caseId,
      "feeding_safety_developmental",
      "round-b"
    );
    await addEvidence(second, "round-b");
    for (const dimension of alwaysRequired.slice(1)) {
      const submissionId = await submit(
        caseId,
        dimension,
        `round-${dimension}`
      );
      await addEvidence(submissionId, `round-${dimension}`);
    }
    const firstAdjudication = id("adjudication-round-one");
    const created = await rpc(admin, "record_catalog_owner_adjudication", {
      p_adjudication_id: firstAdjudication,
      p_case_id: caseId,
      p_dimension: "feeding_safety_developmental",
      p_outcome: "select_qualified_recommendation",
      p_selected_submission_id: first,
      p_notes: "First compatible selection"
    });
    expect(created.error).toBeNull();

    const replacement = await submit(
      caseId,
      "feeding_safety_developmental",
      "round-replacement",
      { supersedesSubmissionId: first }
    );
    await addEvidence(replacement, "round-replacement");
    const stale = await rpc<{ reason_codes: Array<{ code: string }> }>(
      admin,
      "get_catalog_review_eligibility",
      { p_case_id: caseId }
    );
    expect(stale.data?.reason_codes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "owner_adjudication_invalid" })
      ])
    );

    const secondRoot = await rpc(admin, "record_catalog_owner_adjudication", {
      p_adjudication_id: id("adjudication-round-root-two"),
      p_case_id: caseId,
      p_dimension: "feeding_safety_developmental",
      p_outcome: "select_qualified_recommendation",
      p_selected_submission_id: replacement,
      p_notes: "Second root must be rejected"
    });
    expect(secondRoot.error?.message).toMatch(/current tip|root/i);

    const secondAdjudication = await rpc(
      admin,
      "record_catalog_owner_adjudication",
      {
        p_adjudication_id: id("adjudication-round-two"),
        p_case_id: caseId,
        p_dimension: "feeding_safety_developmental",
        p_outcome: "select_qualified_recommendation",
        p_selected_submission_id: replacement,
        p_supersedes_adjudication_id: firstAdjudication,
        p_notes: "Second explicit selection"
      }
    );
    expect(secondAdjudication.error).toBeNull();
    const resolved = await rpc<{ eligible: boolean; reason_codes: unknown[] }>(
      admin,
      "get_catalog_review_eligibility",
      { p_case_id: caseId }
    );
    expect(resolved.data).toEqual(
      expect.objectContaining({ eligible: true, reason_codes: [] })
    );
  });

  test("rejects blocked, unresolved, and clarification-changing reviews", async () => {
    const blockedCase = await createCase("blocked");
    await rpc(admin, "transition_catalog_review_case", {
      p_case_id: blockedCase,
      p_target_status: "ready_for_review",
      p_reason: "ready"
    });
    await rpc(admin, "transition_catalog_review_case", {
      p_case_id: blockedCase,
      p_target_status: "in_review",
      p_reason: "review started"
    });
    await submitCompleteReviews(blockedCase, { decision: "Accept" });
    const { data: priorFeedingReview, error: priorFeedingReviewError } =
      await admin
        .from("catalog_review_submissions")
        .select("id")
        .eq("case_id", blockedCase)
        .eq("dimension", "feeding_safety_developmental")
        .is("supersedes_submission_id", null)
        .single();
    expect(priorFeedingReviewError).toBeNull();
    const mismatchedAuthority = await registerAuthority("feeding-mismatch", [
      "allergy_restriction"
    ]);
    const unqualifiedBlock = await submit(
      blockedCase,
      "feeding_safety_developmental",
      "missing-authority-block",
      {
        decision: "Block",
        authorityReference: mismatchedAuthority,
        supersedesSubmissionId: priorFeedingReview!.id
      }
    );
    await addEvidence(unqualifiedBlock, "missing-authority-block");
    const unqualifiedTransition = await rpc(
      admin,
      "transition_catalog_review_case",
      {
        p_case_id: blockedCase,
        p_target_status: "blocked",
        p_reason: "unqualified domain block must not block"
      }
    );
    expect(unqualifiedTransition.error?.message).toMatch(
      /current qualified domain block/i
    );

    const blockSubmission = await submit(
      blockedCase,
      "feeding_safety_developmental",
      "block",
      {
        decision: "Block",
        supersedesSubmissionId: unqualifiedBlock
      }
    );
    await addEvidence(blockSubmission, "block");
    const blocked = await rpc(admin, "transition_catalog_review_case", {
      p_case_id: blockedCase,
      p_target_status: "blocked",
      p_reason: "qualified domain block"
    });
    expect(blocked.error).toBeNull();
    const adjudication = await rpc(admin, "record_catalog_owner_adjudication", {
      p_adjudication_id: id("adjudication-block"),
      p_case_id: blockedCase,
      p_dimension: "feeding_safety_developmental",
      p_outcome: "select_qualified_recommendation",
      p_notes: "Owner cannot clear a qualified block",
      p_selected_submission_id: blockSubmission
    });
    expect(adjudication.error?.message).toMatch(
      /not a current eligible submission/i
    );
    const blockedReport = await rpc<{ reason_codes: Array<{ code: string }> }>(
      admin,
      "get_catalog_review_eligibility",
      { p_case_id: blockedCase }
    );
    expect(blockedReport.data?.reason_codes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "domain_block" })
      ])
    );
    const clearing = await submit(
      blockedCase,
      "feeding_safety_developmental",
      "clear-block",
      { supersedesSubmissionId: blockSubmission, decision: "Accept" }
    );
    await addEvidence(clearing, "clear-block");
    const reopened = await rpc(admin, "transition_catalog_review_case", {
      p_case_id: blockedCase,
      p_target_status: "in_review",
      p_reason: "qualified clearing review"
    });
    expect(reopened.error).toBeNull();

    const clarificationCase = await createCase("clarification");
    await rpc(admin, "transition_catalog_review_case", {
      p_case_id: clarificationCase,
      p_target_status: "ready_for_review",
      p_reason: "ready"
    });
    await rpc(admin, "transition_catalog_review_case", {
      p_case_id: clarificationCase,
      p_target_status: "in_review",
      p_reason: "review started"
    });
    await submitCompleteReviews(clarificationCase, {
      decision: "Accept with clarification",
      clarificationRequiresCatalogChange: true
    });
    const clarificationReport = await rpc<{
      reason_codes: Array<{ code: string }>;
    }>(admin, "get_catalog_review_eligibility", {
      p_case_id: clarificationCase
    });
    expect(clarificationReport.data?.reason_codes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "clarification_requires_catalog_change"
        })
      ])
    );
  });

  test("keeps submissions, evidence, and supersession history immutable", async () => {
    const caseId = await createCase("history");
    const first = await submit(caseId, "storage_handling", "history-first");
    await addEvidence(first, "history-first");
    const second = await submit(caseId, "storage_handling", "history-second", {
      supersedesSubmissionId: first,
      decision: "Accept with clarification"
    });
    await addEvidence(second, "history-second");
    const adjudicationId = id("adjudication-history");
    const adjudication = await rpc(admin, "record_catalog_owner_adjudication", {
      p_adjudication_id: adjudicationId,
      p_case_id: caseId,
      p_dimension: "storage_handling",
      p_outcome: "select_qualified_recommendation",
      p_notes: "Synthetic history adjudication",
      p_selected_submission_id: second
    });
    expect(adjudication.error).toBeNull();

    const oldSubmissionUpdate = await admin
      .from("catalog_review_submissions")
      .update({ notes: "mutated" })
      .eq("id", first);
    expect(oldSubmissionUpdate.error?.code).toBe("42501");
    const evidenceUpdate = await admin
      .from("catalog_review_submission_evidence")
      .update({ evidence_reference: "mutated" })
      .eq("id", id(`evidence-${first}-history-first`));
    expect(evidenceUpdate.error?.code).toBe("42501");
    const adjudicationUpdate = await admin
      .from("catalog_owner_adjudications")
      .update({ notes: "mutated" })
      .eq("id", adjudicationId);
    expect(adjudicationUpdate.error?.code).toBe("42501");
    expect(second).not.toBe(first);
  });
});

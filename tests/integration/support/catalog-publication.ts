import type { SupabaseClient } from "@supabase/supabase-js";

import { canonicalizeCatalogImport } from "../../../src/modules/catalog-import/canonical";

type JsonRecord = Record<string, unknown>;

type CatalogFixture = {
  sources: readonly JsonRecord[];
  tags: readonly JsonRecord[];
  foods: readonly JsonRecord[];
  preparations: readonly JsonRecord[];
  revisions: readonly JsonRecord[];
  visuals?: readonly JsonRecord[];
  retirements?: readonly JsonRecord[];
};

function safeId(prefix: string, value: unknown) {
  const normalized = String(value ?? "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-");
  return `${prefix}-${normalized}`;
}

function requireSuccess(
  result: { error: { message?: string } | null },
  operation: string
) {
  if (result.error) {
    throw new Error(`${operation}: ${result.error.message ?? "unknown error"}`);
  }
}

function asDate(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : null;
}

/**
 * Test-only bridge for user-facing integration fixtures. It deliberately
 * exercises candidate import, qualified review import, completion, and the
 * controlled publication RPC; the fixture importer remains a lower-level
 * seam and never makes rows public.
 */
export async function publishCatalogFixtureForTest(
  admin: SupabaseClient,
  fixture: CatalogFixture
) {
  const suffix = crypto.randomUUID();
  const revisions = fixture.revisions.map((revision) => ({
    id: revision.id,
    preparation_id: revision.preparation_id,
    version: revision.version,
    status: "draft",
    method: revision.method,
    shape_texture: revision.shape_texture,
    source_id: revision.source_id,
    tag_ids: revision.tag_ids,
    visual_required: revision.visual_required === true,
    visual_ids: Array.isArray(revision.visual_ids) ? revision.visual_ids : [],
    preparation_time_band: revision.preparation_time_band ?? "under_15_minutes",
    storage_rules: revision.storage_rules ?? []
  }));
  const cases = revisions.map((revision) => ({
    case_id: safeId("case", revision.id),
    revision_id: revision.id
  }));
  const candidateEnvelope: JsonRecord = {
    schema_version: "candidate-package/v1",
    package_id: `candidate-fixture-${suffix}`,
    package_version: "1",
    package_created_at: new Date().toISOString(),
    classification: "production_candidate",
    review_cases: cases,
    payload: {
      sources: fixture.sources,
      tags: fixture.tags,
      foods: fixture.foods,
      preparations: fixture.preparations.map((preparation) => ({
        ...preparation,
        is_active: false
      })),
      revisions,
      visuals: fixture.visuals ?? []
    }
  };
  candidateEnvelope.payload_digest =
    canonicalizeCatalogImport(candidateEnvelope).digest;
  const candidateResult = await admin.rpc("import_catalog_candidate_package", {
    p_envelope: candidateEnvelope
  });
  requireSuccess(candidateResult, "candidate import");
  if (candidateResult.data?.accepted === false) {
    throw new Error(
      `candidate import rejected: ${JSON.stringify(candidateResult.data)}`
    );
  }

  const authority = `authority-fixture-${suffix}`;
  const retiredRevisionIds = new Set(
    (fixture.retirements ?? []).map((retirement) =>
      String(retirement.revision_id)
    )
  );
  requireSuccess(
    await admin.rpc("register_catalog_reviewer_authority", {
      p_reference: authority,
      p_authority_basis: "Synthetic test-only qualified authority",
      p_evidence_location: `https://example.test/authority/${suffix}`,
      p_dimensions: [
        "feeding_safety_developmental",
        "allergy_restriction",
        "nutrition_age_stage",
        "taxonomy_labeling",
        "storage_handling",
        "visual_accessibility_rights"
      ]
    }),
    "authority registration"
  );

  for (const revision of fixture.revisions) {
    if (revision.status !== "approved") continue;
    const visualIds = Array.isArray(revision.visual_ids)
      ? revision.visual_ids
      : [];
    const dimensions = [
      "feeding_safety_developmental",
      "allergy_restriction",
      "nutrition_age_stage",
      "taxonomy_labeling",
      "storage_handling",
      ...(revision.visual_required === true || visualIds.length > 0
        ? ["visual_accessibility_rights"]
        : [])
    ];
    const submissions = dimensions.map((dimension) => ({
      id: safeId(`submission-${suffix}`, `${revision.id}-${dimension}`),
      dimension,
      decision: "Accept",
      reviewer_role:
        typeof revision.reviewer_role === "string" && revision.reviewer_role
          ? revision.reviewer_role
          : "synthetic test-only qualified reviewer",
      reviewer_authority_reference: authority,
      reviewed_at: asDate(revision.reviewed_at) ?? "2026-08-04",
      approval_reference_id: safeId(
        `approval-${suffix}`,
        `${revision.id}-${dimension}`
      ),
      follow_up_status: "none",
      clarification_requires_catalog_change: false,
      ...(dimension === "storage_handling"
        ? {
            storage_support_state:
              Array.isArray(revision.storage_rules) &&
              revision.storage_rules.some(
                (rule) => rule.support_status === "supported"
              )
                ? "supported"
                : "unsupported"
          }
        : {}),
      storage_context: {},
      visual_context:
        dimension === "visual_accessibility_rights"
          ? { visual_reference: "synthetic-test-visual" }
          : {},
      supersedes_submission_id: null,
      evidence: [
        {
          id: safeId(`evidence-${suffix}`, `${revision.id}-${dimension}`),
          field_or_claim: dimension,
          evidence_reference: `https://example.test/evidence/${suffix}/${revision.id}/${dimension}`,
          source_id: revision.source_id
        }
      ]
    }));
    const packet: JsonRecord = {
      schema_version: "qualified-review-packet/v1",
      package_id: safeId(`review-${suffix}`, revision.id),
      package_version: "1",
      package_created_at: new Date().toISOString(),
      case_id: safeId("case", revision.id),
      revision_id: revision.id,
      classification: "production_candidate",
      submissions
    };
    packet.payload_digest = canonicalizeCatalogImport(packet).digest;
    requireSuccess(
      await admin.rpc("import_catalog_review_packet", { p_envelope: packet }),
      `review import ${revision.id}`
    );
    requireSuccess(
      await admin.rpc("transition_catalog_review_case", {
        p_case_id: safeId("case", revision.id),
        p_target_status: "completed",
        p_reason: "Synthetic test-only review completed"
      }),
      `review completion ${revision.id}`
    );
    const nextReviewAt = asDate(revision.next_review_at);
    const approvedAt = asDate(revision.approved_at) ?? "2026-08-04";
    if (
      retiredRevisionIds.has(String(revision.id)) ||
      !nextReviewAt ||
      nextReviewAt < new Date().toISOString().slice(0, 10)
    ) {
      continue;
    }
    const existingPublication = await admin
      .from("catalog_publications")
      .select("id")
      .eq("revision_id", revision.id)
      .maybeSingle();
    requireSuccess(existingPublication, `publication lookup ${revision.id}`);
    if (existingPublication.data) continue;
    const publication = await admin.rpc("publish_catalog_review_case", {
      p_publication_id: safeId(`publication-${suffix}`, revision.id),
      p_case_id: safeId("case", revision.id),
      p_release_owner_decision_reference: `synthetic-test-owner-decision-${suffix}`,
      p_source_validation_reference: `synthetic-test-source-validation-${suffix}`,
      p_approved_at: approvedAt,
      p_next_review_at: nextReviewAt
    });
    if (publication.error) {
      const confirmed = await admin
        .from("catalog_publications")
        .select("id")
        .eq("revision_id", revision.id)
        .maybeSingle();
      requireSuccess(confirmed, `publication confirmation ${revision.id}`);
      if (!confirmed.data) {
        throw new Error(
          `publication ${revision.id}: ${publication.error.message ?? "unknown error"}`
        );
      }
    }
  }

  if (fixture.retirements && fixture.retirements.length > 0) {
    requireSuccess(
      await admin.from("content_retirements").insert(fixture.retirements),
      "fixture retirement"
    );
  }
}

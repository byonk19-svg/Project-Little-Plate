import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, test } from "vitest";

import { canonicalizeCatalogImport } from "../../src/modules/catalog-import/canonical";
import {
  type LocalSupabaseStatus,
  readLocalSupabaseStatus
} from "./support/local-supabase";

let status: LocalSupabaseStatus;
let admin: SupabaseClient;
let anonymous: SupabaseClient;
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

const rpc = async (
  client: SupabaseClient,
  name: string,
  args: Record<string, unknown>
) => client.rpc(name, args);

function ids(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

type Candidate = {
  envelope: Record<string, unknown>;
  caseId: string;
  revisionId: string;
  preparationId: string;
  slug: string;
};

function candidateEnvelope(): Candidate {
  const suffix = crypto.randomUUID();
  const sourceId = `source-${suffix}`;
  const skillTagId = `skill-${suffix}`;
  const allergenTagId = `allergen-${suffix}`;
  const foodId = `food-${suffix}`;
  const preparationId = `preparation-${suffix}`;
  const revisionId = `revision-${suffix}`;
  const caseId = `case-${suffix}`;
  const slug = `preparation-${suffix}`;
  const envelope: Record<string, unknown> = {
    schema_version: "candidate-package/v1",
    package_id: `candidate-${suffix}`,
    package_version: "1",
    package_created_at: "2026-08-04T12:00:00Z",
    classification: "production_candidate",
    review_cases: [{ case_id: caseId, revision_id: revisionId }],
    payload: {
      sources: [
        {
          id: sourceId,
          publisher: "Synthetic publication source",
          title: "Synthetic publication reference",
          url: "https://example.test/publication",
          source_date: "2026-08-01",
          accessed_at: "2026-08-04"
        }
      ],
      tags: [
        { id: skillTagId, kind: "skill", label: "Synthetic skill" },
        { id: allergenTagId, kind: "allergen", label: "Synthetic allergen" }
      ],
      foods: [
        {
          id: foodId,
          slug: `food-${suffix}`,
          name: "Synthetic publication food",
          category: "synthetic"
        }
      ],
      preparations: [
        {
          id: preparationId,
          food_id: foodId,
          slug,
          name: "Synthetic publication preparation",
          is_active: false
        }
      ],
      revisions: [
        {
          id: revisionId,
          preparation_id: preparationId,
          version: 1,
          status: "draft",
          method: "Synthetic method",
          shape_texture: "Synthetic shape",
          source_id: sourceId,
          tag_ids: [skillTagId, allergenTagId],
          storage_rules: [
            {
              id: `storage-rule-${suffix}`,
              support_status: "unsupported",
              deadline_kind: null,
              duration_hours: null,
              guidance: null
            }
          ],
          visual_required: false,
          preparation_time_band: "under_15_minutes",
          visual_ids: []
        }
      ],
      visuals: []
    }
  };
  envelope.payload_digest = canonicalizeCatalogImport(envelope).digest;
  return { envelope, caseId, revisionId, preparationId, slug };
}

function successorEnvelope(previous: Candidate): Candidate {
  const suffix = crypto.randomUUID();
  const envelope = structuredClone(previous.envelope) as Record<
    string,
    unknown
  >;
  const caseId = `case-${suffix}`;
  const revisionId = `revision-${suffix}`;
  envelope.package_id = `candidate-${suffix}`;
  envelope.package_version = "2";
  envelope.review_cases = [{ case_id: caseId, revision_id: revisionId }];
  const payload = envelope.payload as Record<string, unknown>;
  payload.preparations = (
    payload.preparations as Array<Record<string, unknown>>
  ).map((preparation: Record<string, unknown>) => ({
    ...preparation,
    is_active: true
  }));
  payload.revisions = (payload.revisions as Array<Record<string, unknown>>).map(
    (revision: Record<string, unknown>) => ({
      ...revision,
      id: revisionId,
      version: 2,
      method: "Synthetic successor method",
      storage_rules: (
        revision.storage_rules as Array<Record<string, unknown>>
      ).map((rule: Record<string, unknown>) => ({
        ...rule,
        id: `storage-rule-${suffix}`
      }))
    })
  );
  envelope.payload_digest = canonicalizeCatalogImport(envelope).digest;
  return {
    envelope,
    caseId,
    revisionId,
    preparationId: previous.preparationId,
    slug: previous.slug
  };
}

async function importCandidate(candidate: Candidate) {
  const result = await rpc(admin, "import_catalog_candidate_package", {
    p_envelope: candidate.envelope
  });
  expect(result.error).toBeNull();
}

async function importQualifiedReviews(
  candidate: Candidate,
  dimensions: string[]
) {
  const authority = ids("authority");
  const authorityResult = await rpc(
    admin,
    "register_catalog_reviewer_authority",
    {
      p_reference: authority,
      p_authority_basis: "Synthetic qualified publication authority",
      p_evidence_location: `https://example.test/${authority}`,
      p_dimensions: dimensions
    }
  );
  expect(authorityResult.error).toBeNull();

  const submissions = dimensions.map((dimension) => ({
    id: ids("submission"),
    dimension,
    decision: "Accept",
    reviewer_role: "synthetic qualified reviewer",
    reviewer_authority_reference: authority,
    reviewed_at: "2026-08-04",
    approval_reference_id: ids("approval"),
    follow_up_status: "none",
    clarification_requires_catalog_change: false,
    ...(dimension === "storage_handling"
      ? { storage_support_state: "unsupported" }
      : {}),
    storage_context: {},
    visual_context: {},
    supersedes_submission_id: null,
    evidence: [
      {
        id: ids("evidence"),
        field_or_claim: dimension,
        evidence_reference: `https://example.test/evidence/${dimension}`
      }
    ]
  }));
  const packet: Record<string, unknown> = {
    schema_version: "qualified-review-packet/v1",
    package_id: ids("review"),
    package_version: "1",
    package_created_at: "2026-08-04T12:00:00Z",
    case_id: candidate.caseId,
    revision_id: candidate.revisionId,
    classification: "production_candidate",
    submissions
  };
  packet.payload_digest = canonicalizeCatalogImport(packet).digest;
  const result = await rpc(admin, "import_catalog_review_packet", {
    p_envelope: packet
  });
  expect(result.error).toBeNull();
}

async function complete(candidate: Candidate) {
  const result = await rpc(admin, "transition_catalog_review_case", {
    p_case_id: candidate.caseId,
    p_target_status: "completed",
    p_reason: "Synthetic publication gate test review is complete"
  });
  expect(result.error).toBeNull();
}

async function publishedItems() {
  const result = await rpc(anonymous, "list_published_catalog_items", {});
  expect(result.error).toBeNull();
  return result.data as Array<Record<string, unknown>>;
}

describe("catalog publication gate", () => {
  beforeAll(() => {
    status = readLocalSupabaseStatus();
    admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    anonymous = createClient(status.API_URL, status.ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  });

  beforeAll(async () => {
    await runDatabaseCommand(`
      create or replace function public.test_catalog_guc_mutation(
        p_revision_id text,
        p_is_local boolean
      ) returns jsonb
      language plpgsql
      security invoker
      set search_path = public, pg_catalog
      as $function$
      begin
        perform pg_catalog.set_config(
          'app.catalog_publication_transition',
          'on',
          p_is_local
        );
        update public.content_revisions
        set method = method || '-spoofed'
        where id = p_revision_id;
        return jsonb_build_object('updated', true);
      end;
      $function$;
      revoke all on function public.test_catalog_guc_mutation(text, boolean)
        from public, anon, authenticated;
      grant execute on function public.test_catalog_guc_mutation(text, boolean)
        to service_role;
      notify pgrst, 'reload schema';
    `);
  });

  test("publishes one completed eligible candidate through every public catalog read", async () => {
    const candidate = candidateEnvelope();
    await importCandidate(candidate);
    await importQualifiedReviews(candidate, [
      "feeding_safety_developmental",
      "allergy_restriction",
      "nutrition_age_stage",
      "taxonomy_labeling",
      "storage_handling"
    ]);
    await complete(candidate);

    const publicationId = ids("publication");
    const publish = await rpc(admin, "publish_catalog_review_case", {
      p_publication_id: publicationId,
      p_case_id: candidate.caseId,
      p_release_owner_decision_reference: `owner-decision-${publicationId}`,
      p_source_validation_reference: `source-validation-${publicationId}`,
      p_approved_at: "2026-08-04",
      p_next_review_at: "2026-12-31"
    });
    expect(publish.error).toBeNull();
    expect(publish.data).toMatchObject({
      published: true,
      publication_id: publicationId,
      case_id: candidate.caseId,
      revision_id: candidate.revisionId
    });

    const replay = await rpc(admin, "publish_catalog_review_case", {
      p_publication_id: publicationId,
      p_case_id: candidate.caseId,
      p_release_owner_decision_reference: `owner-decision-${publicationId}`,
      p_source_validation_reference: `source-validation-${publicationId}`,
      p_approved_at: "2026-08-04",
      p_next_review_at: "2026-12-31"
    });
    expect(replay.error).toBeNull();
    expect(replay.data).toMatchObject({ published: true, replayed: true });

    const items = await publishedItems();
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ slug: candidate.slug })
      ])
    );
    const detail = await rpc(anonymous, "get_published_preparation", {
      p_slug: candidate.slug
    });
    expect(detail.error).toBeNull();
    expect(detail.data).toMatchObject({
      slug: candidate.slug,
      revision_id: candidate.revisionId
    });
    const legacyList = await rpc(anonymous, "list_published_preparations", {});
    expect(legacyList.error).toBeNull();
    expect(legacyList.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ slug: candidate.slug })
      ])
    );
  });

  test("publishes a reviewed successor without hiding the prior publication", async () => {
    const first = candidateEnvelope();
    await importCandidate(first);
    await importQualifiedReviews(first, [
      "feeding_safety_developmental",
      "allergy_restriction",
      "nutrition_age_stage",
      "taxonomy_labeling",
      "storage_handling"
    ]);
    await complete(first);
    const firstPublicationId = ids("publication");
    const firstPublication = await rpc(admin, "publish_catalog_review_case", {
      p_publication_id: firstPublicationId,
      p_case_id: first.caseId,
      p_release_owner_decision_reference: `owner-decision-${firstPublicationId}`,
      p_source_validation_reference: `source-validation-${firstPublicationId}`,
      p_approved_at: "2026-08-04",
      p_next_review_at: "2026-12-31"
    });
    expect(firstPublication.error).toBeNull();

    const successor = successorEnvelope(first);
    await importCandidate(successor);
    await importQualifiedReviews(successor, [
      "feeding_safety_developmental",
      "allergy_restriction",
      "nutrition_age_stage",
      "taxonomy_labeling",
      "storage_handling"
    ]);
    await complete(successor);

    const beforeReplacement = await rpc(
      anonymous,
      "get_published_preparation",
      {
        p_slug: first.slug
      }
    );
    expect(beforeReplacement.error).toBeNull();
    expect(beforeReplacement.data).toMatchObject({
      revision_id: first.revisionId
    });

    const successorPublicationId = ids("publication");
    const successorPublication = await rpc(
      admin,
      "publish_catalog_review_case",
      {
        p_publication_id: successorPublicationId,
        p_case_id: successor.caseId,
        p_release_owner_decision_reference: `owner-decision-${successorPublicationId}`,
        p_source_validation_reference: `source-validation-${successorPublicationId}`,
        p_approved_at: "2026-08-04",
        p_next_review_at: "2026-12-31"
      }
    );
    expect(successorPublication.error).toBeNull();
    expect(successorPublication.data).toMatchObject({
      published: true,
      revision_id: successor.revisionId
    });

    const afterReplacement = await rpc(anonymous, "get_published_preparation", {
      p_slug: first.slug
    });
    expect(afterReplacement.error).toBeNull();
    expect(afterReplacement.data).toMatchObject({
      revision_id: successor.revisionId
    });

    const retiredSuccessor = await admin.from("content_retirements").insert({
      revision_id: successor.revisionId,
      retired_at: "2026-08-05",
      reason: "Synthetic successor retirement regression"
    });
    expect(retiredSuccessor.error).toBeNull();
    const afterRetirement = await rpc(anonymous, "get_published_preparation", {
      p_slug: first.slug
    });
    expect(afterRetirement.error).toBeNull();
    expect(afterRetirement.data).toBeNull();
  });

  test("an expired successor does not reactivate its historical predecessor", async () => {
    const first = candidateEnvelope();
    await importCandidate(first);
    await importQualifiedReviews(first, [
      "feeding_safety_developmental",
      "allergy_restriction",
      "nutrition_age_stage",
      "taxonomy_labeling",
      "storage_handling"
    ]);
    await complete(first);
    const firstPublicationId = ids("publication");
    expect(
      (
        await rpc(admin, "publish_catalog_review_case", {
          p_publication_id: firstPublicationId,
          p_case_id: first.caseId,
          p_release_owner_decision_reference: `owner-decision-${firstPublicationId}`,
          p_source_validation_reference: `source-validation-${firstPublicationId}`,
          p_approved_at: "2026-08-04",
          p_next_review_at: "2026-12-31"
        })
      ).error
    ).toBeNull();

    const successor = successorEnvelope(first);
    await importCandidate(successor);
    await importQualifiedReviews(successor, [
      "feeding_safety_developmental",
      "allergy_restriction",
      "nutrition_age_stage",
      "taxonomy_labeling",
      "storage_handling"
    ]);
    await complete(successor);
    const successorPublicationId = ids("publication");
    expect(
      (
        await rpc(admin, "publish_catalog_review_case", {
          p_publication_id: successorPublicationId,
          p_case_id: successor.caseId,
          p_release_owner_decision_reference: `owner-decision-${successorPublicationId}`,
          p_source_validation_reference: `source-validation-${successorPublicationId}`,
          p_approved_at: "2026-08-04",
          p_next_review_at: "2026-12-31"
        })
      ).error
    ).toBeNull();

    await runDatabaseCommand(`
      alter table public.catalog_publications disable trigger catalog_publications_append_only;
      update public.catalog_publications
      set next_review_at = date '2026-08-04'
      where id = '${successorPublicationId}';
      alter table public.catalog_publications enable trigger catalog_publications_append_only;
    `);

    const expiredDetail = await rpc(anonymous, "get_published_preparation", {
      p_slug: first.slug
    });
    expect(expiredDetail.error).toBeNull();
    expect(expiredDetail.data).toBeNull();
    expect(
      (await publishedItems()).some((item) => item.slug === first.slug)
    ).toBe(false);
  });

  test("service-role GUC attempts cannot mutate a frozen publication snapshot", async () => {
    const candidate = candidateEnvelope();
    await importCandidate(candidate);
    await importQualifiedReviews(candidate, [
      "feeding_safety_developmental",
      "allergy_restriction",
      "nutrition_age_stage",
      "taxonomy_labeling",
      "storage_handling"
    ]);
    await complete(candidate);
    const publicationId = ids("publication");
    const published = await rpc(admin, "publish_catalog_review_case", {
      p_publication_id: publicationId,
      p_case_id: candidate.caseId,
      p_release_owner_decision_reference: `owner-decision-${publicationId}`,
      p_source_validation_reference: `source-validation-${publicationId}`,
      p_approved_at: "2026-08-04",
      p_next_review_at: "2026-12-31"
    });
    expect(published.error).toBeNull();

    for (const p_is_local of [false, true]) {
      const attempted = await rpc(admin, "test_catalog_guc_mutation", {
        p_revision_id: candidate.revisionId,
        p_is_local
      });
      expect(attempted.error).not.toBeNull();
    }

    const unchanged = await admin
      .from("content_revisions")
      .select("method")
      .eq("id", candidate.revisionId)
      .single();
    expect(unchanged.error).toBeNull();
    expect(unchanged.data).toMatchObject({ method: "Synthetic method" });

    const directUpdate = await admin
      .from("catalog_publications")
      .update({ release_owner_decision_reference: "direct-update" })
      .eq("id", publicationId)
      .select("id");
    expect(directUpdate.error).not.toBeNull();

    const directDelete = await admin
      .from("catalog_publications")
      .delete()
      .eq("id", publicationId)
      .select("id");
    expect(directDelete.error).not.toBeNull();

    const directInsert = await admin.from("catalog_publications").insert({
      id: ids("direct-publication"),
      case_id: candidate.caseId,
      revision_id: candidate.revisionId,
      classification: "production_candidate",
      effective_submission_ids: [],
      effective_approval_reference_ids: [],
      effective_adjudication_ids: [],
      release_owner_decision_reference: "direct-insert",
      source_validation_reference: "direct-insert",
      approved_at: "2026-08-04",
      next_review_at: "2026-12-31"
    });
    expect(directInsert.error).not.toBeNull();

    const stillPublished = await rpc(anonymous, "get_published_preparation", {
      p_slug: candidate.slug
    });
    expect(stillPublished.error).toBeNull();
    expect(stillPublished.data).toMatchObject({
      revision_id: candidate.revisionId
    });

    const replay = await rpc(admin, "publish_catalog_review_case", {
      p_publication_id: publicationId,
      p_case_id: candidate.caseId,
      p_release_owner_decision_reference: `owner-decision-${publicationId}`,
      p_source_validation_reference: `source-validation-${publicationId}`,
      p_approved_at: "2026-08-04",
      p_next_review_at: "2026-12-31"
    });
    expect(replay.error).toBeNull();
    expect(replay.data).toMatchObject({ published: true, replayed: true });
  });

  test("keeps draft, in-review, changes-requested, completed-unpublished, and synthetic rows invisible", async () => {
    const draft = candidateEnvelope();
    await importCandidate(draft);

    const inReview = candidateEnvelope();
    await importCandidate(inReview);
    await importQualifiedReviews(inReview, ["storage_handling"]);

    const changesRequested = candidateEnvelope();
    await importCandidate(changesRequested);
    await importQualifiedReviews(changesRequested, ["storage_handling"]);
    const changesResult = await rpc(admin, "transition_catalog_review_case", {
      p_case_id: changesRequested.caseId,
      p_target_status: "changes_requested",
      p_reason: "Synthetic change request"
    });
    expect(changesResult.error).toBeNull();

    const completed = candidateEnvelope();
    await importCandidate(completed);
    await importQualifiedReviews(completed, [
      "feeding_safety_developmental",
      "allergy_restriction",
      "nutrition_age_stage",
      "taxonomy_labeling",
      "storage_handling"
    ]);
    await complete(completed);

    const synthetic = candidateEnvelope();
    const fixture = structuredClone(synthetic.envelope) as Record<
      string,
      unknown
    >;
    fixture.classification = "fixture";
    fixture.payload_digest = canonicalizeCatalogImport(fixture).digest;
    const fixtureResult = await rpc(admin, "import_catalog_candidate_package", {
      p_envelope: fixture
    });
    expect(fixtureResult.error).toBeNull();

    const items = await publishedItems();
    for (const slug of [
      draft.slug,
      inReview.slug,
      changesRequested.slug,
      completed.slug,
      synthetic.slug
    ]) {
      expect(items.some((item) => item.slug === slug)).toBe(false);
      const detail = await rpc(anonymous, "get_published_preparation", {
        p_slug: slug
      });
      expect(detail.error).toBeNull();
      expect(detail.data).toBeNull();
    }
  });

  test("rejects publication without completion, approval coverage, or current dates", async () => {
    const candidate = candidateEnvelope();
    await importCandidate(candidate);
    const incomplete = await rpc(admin, "publish_catalog_review_case", {
      p_publication_id: ids("publication-incomplete"),
      p_case_id: candidate.caseId,
      p_release_owner_decision_reference: "owner-decision",
      p_source_validation_reference: "source-validation",
      p_approved_at: "2026-08-04",
      p_next_review_at: "2026-12-31"
    });
    expect(incomplete.error).not.toBeNull();

    const noApproval = candidateEnvelope();
    await importCandidate(noApproval);
    await importQualifiedReviews(noApproval, [
      "feeding_safety_developmental",
      "allergy_restriction",
      "nutrition_age_stage",
      "taxonomy_labeling"
    ]);
    const authority = ids("authority");
    const registered = await rpc(admin, "register_catalog_reviewer_authority", {
      p_reference: authority,
      p_authority_basis: "Synthetic qualified publication authority",
      p_evidence_location: `https://example.test/${authority}`,
      p_dimensions: ["storage_handling"]
    });
    expect(registered.error).toBeNull();
    const submissionId = ids("submission-no-approval");
    const submitted = await rpc(admin, "submit_catalog_review", {
      p_submission_id: submissionId,
      p_case_id: noApproval.caseId,
      p_revision_id: noApproval.revisionId,
      p_dimension: "storage_handling",
      p_decision: "Accept",
      p_reviewer_role: "synthetic qualified reviewer",
      p_reviewer_authority_reference: authority,
      p_reviewed_at: "2026-08-04",
      p_follow_up_status: "none",
      p_clarification_requires_catalog_change: false,
      p_storage_support_state: "unsupported",
      p_storage_context: {},
      p_visual_context: {}
    });
    expect(submitted.error).toBeNull();
    const evidence = await rpc(admin, "record_catalog_review_evidence", {
      p_evidence_id: ids("evidence-no-approval"),
      p_submission_id: submissionId,
      p_field_or_claim: "storage_handling",
      p_evidence_reference: "https://example.test/evidence-no-approval",
      p_source_id: null
    });
    expect(evidence.error).toBeNull();
    await complete(noApproval);
    const missingApproval = await rpc(admin, "publish_catalog_review_case", {
      p_publication_id: ids("publication-no-approval"),
      p_case_id: noApproval.caseId,
      p_release_owner_decision_reference: "owner-decision",
      p_source_validation_reference: "source-validation",
      p_approved_at: "2026-08-04",
      p_next_review_at: "2026-12-31"
    });
    expect(missingApproval.error).not.toBeNull();

    const overdue = candidateEnvelope();
    await importCandidate(overdue);
    await importQualifiedReviews(overdue, [
      "feeding_safety_developmental",
      "allergy_restriction",
      "nutrition_age_stage",
      "taxonomy_labeling",
      "storage_handling"
    ]);
    await complete(overdue);
    const overduePublish = await rpc(admin, "publish_catalog_review_case", {
      p_publication_id: ids("publication-overdue"),
      p_case_id: overdue.caseId,
      p_release_owner_decision_reference: "owner-decision",
      p_source_validation_reference: "source-validation",
      p_approved_at: "2026-08-04",
      p_next_review_at: "2026-08-03"
    });
    expect(overduePublish.error).not.toBeNull();
    expect(
      (await publishedItems()).some((item) => item.slug === overdue.slug)
    ).toBe(false);

    const retired = candidateEnvelope();
    await importCandidate(retired);
    await importQualifiedReviews(retired, [
      "feeding_safety_developmental",
      "allergy_restriction",
      "nutrition_age_stage",
      "taxonomy_labeling",
      "storage_handling"
    ]);
    await complete(retired);
    const retirement = await admin.from("content_retirements").insert({
      revision_id: retired.revisionId,
      retired_at: "2026-08-04",
      reason: "Synthetic publication gate retirement"
    });
    expect(retirement.error).toBeNull();
    const retiredPublish = await rpc(admin, "publish_catalog_review_case", {
      p_publication_id: ids("publication-retired"),
      p_case_id: retired.caseId,
      p_release_owner_decision_reference: "owner-decision-retired",
      p_source_validation_reference: "source-validation-retired",
      p_approved_at: "2026-08-04",
      p_next_review_at: "2026-12-31"
    });
    expect(retiredPublish.error?.message).toContain("retired");
  });

  test("retires an existing publication from every public read", async () => {
    const candidate = candidateEnvelope();
    await importCandidate(candidate);
    await importQualifiedReviews(candidate, [
      "feeding_safety_developmental",
      "allergy_restriction",
      "nutrition_age_stage",
      "taxonomy_labeling",
      "storage_handling"
    ]);
    await complete(candidate);
    const publicationId = ids("publication-retire");
    const published = await rpc(admin, "publish_catalog_review_case", {
      p_publication_id: publicationId,
      p_case_id: candidate.caseId,
      p_release_owner_decision_reference: "owner-decision-retire",
      p_source_validation_reference: "source-validation-retire",
      p_approved_at: "2026-08-04",
      p_next_review_at: "2026-12-31"
    });
    expect(published.error).toBeNull();
    const retired = await admin.from("content_retirements").insert({
      revision_id: candidate.revisionId,
      retired_at: "2026-08-04",
      reason: "Synthetic publication retirement test"
    });
    expect(retired.error).toBeNull();
    expect(
      (await publishedItems()).some((item) => item.slug === candidate.slug)
    ).toBe(false);
    const detail = await rpc(anonymous, "get_published_preparation", {
      p_slug: candidate.slug
    });
    expect(detail.error).toBeNull();
    expect(detail.data).toBeNull();
  });
});

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { canonicalizeCatalogImport } from "../../src/modules/catalog-import/canonical";
import {
  authenticatedClient,
  type LocalSupabaseStatus,
  readLocalSupabaseStatus
} from "./support/local-supabase";

let status: LocalSupabaseStatus;
let admin: SupabaseClient;
let anonymous: SupabaseClient;
let caregiver: SupabaseClient;
let createdUserId: string | null = null;
let caregiverPassword = "";
let revisionId = "";
let caseId = "";
let slug = "";

function id(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

async function rpc<T = unknown>(
  client: SupabaseClient,
  name: string,
  args: Record<string, unknown> = {}
) {
  return (await client.rpc(name, args)) as {
    data: T | null;
    error: { message: string; code?: string } | null;
  };
}

function candidateEnvelope() {
  const suffix = crypto.randomUUID();
  const sourceId = id("source-private");
  const skillTagId = id("skill-private");
  const allergenTagId = id("allergen-private");
  const foodId = id("food-private");
  const preparationId = id("preparation-private");
  revisionId = id("revision-private");
  caseId = id("case-private");
  slug = `preparation-private-${suffix}`;

  const envelope: Record<string, unknown> = {
    schema_version: "candidate-package/v1",
    package_id: id("candidate-private"),
    package_version: "1",
    package_created_at: "2026-08-08T12:00:00Z",
    classification: "production_candidate",
    review_cases: [{ case_id: caseId, revision_id: revisionId }],
    payload: {
      sources: [
        {
          id: sourceId,
          publisher: "Synthetic owner dogfood source",
          title: "Synthetic owner dogfood reference",
          url: "https://example.test/private-dogfood",
          source_date: "2026-08-01",
          accessed_at: "2026-08-08"
        }
      ],
      tags: [
        { id: skillTagId, kind: "skill", label: "Synthetic skill" },
        { id: allergenTagId, kind: "allergen", label: "Synthetic allergen" }
      ],
      foods: [
        {
          id: foodId,
          slug: `food-private-${suffix}`,
          name: "Synthetic owner dogfood food",
          category: "synthetic"
        }
      ],
      preparations: [
        {
          id: preparationId,
          food_id: foodId,
          slug,
          name: "Synthetic owner dogfood preparation",
          is_active: false
        }
      ],
      revisions: [
        {
          id: revisionId,
          preparation_id: preparationId,
          version: 1,
          status: "draft",
          method: "Synthetic owner dogfood method",
          shape_texture: "Synthetic owner dogfood shape",
          source_id: sourceId,
          tag_ids: [skillTagId, allergenTagId],
          storage_rules: [
            {
              id: id("storage-private"),
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
  return envelope;
}

describe("private owner dogfood publication", () => {
  beforeAll(async () => {
    status = readLocalSupabaseStatus();
    admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    anonymous = createClient(status.API_URL, status.ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const imported = await rpc(admin, "import_catalog_candidate_package", {
      p_envelope: candidateEnvelope()
    });
    expect(imported.error).toBeNull();

    const email = `private-dogfood-${crypto.randomUUID()}@example.test`;
    caregiverPassword = `Private-dogfood-${crypto.randomUUID()}`;
    const created = await admin.auth.admin.createUser({
      email,
      password: caregiverPassword,
      email_confirm: true
    });
    expect(created.error).toBeNull();
    createdUserId = created.data.user!.id;
    const signInClient = createClient(status.API_URL, status.ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const signIn = await signInClient.auth.signInWithPassword({
      email,
      password: caregiverPassword
    });
    expect(signIn.error).toBeNull();
    caregiver = authenticatedClient(status, signIn.data.session!.access_token);
  });

  afterAll(async () => {
    if (createdUserId) await admin.auth.admin.deleteUser(createdUserId);
    if (revisionId) {
      await admin.from("content_retirements").insert({
        revision_id: revisionId,
        retired_at: "2026-08-08",
        reason: "Synthetic private dogfood test cleanup"
      });
    }
  });

  test("owner approval publishes only to authenticated private dogfood reads", async () => {
    const approvalArgs = {
      p_revision_id: revisionId,
      p_approval_reference_id: id("owner-approval"),
      p_reviewed_at: "2026-08-08",
      p_approved_at: "2026-08-08",
      p_next_review_at: "2026-12-31"
    };
    const approval = await rpc(
      admin,
      "approve_private_dogfood_revision",
      approvalArgs
    );
    expect(approval.error).toBeNull();
    expect(approval.data).toMatchObject({
      review_standard: "private_dogfood_owner",
      reviewer_role: "product_owner"
    });
    const approvalReplay = await rpc(
      admin,
      "approve_private_dogfood_revision",
      approvalArgs
    );
    expect(approvalReplay.error).toBeNull();
    expect(approvalReplay.data).toMatchObject({
      approved: true,
      replayed: true
    });
    const changedApproval = await rpc(
      admin,
      "approve_private_dogfood_revision",
      { ...approvalArgs, p_approval_reference_id: id("owner-approval-other") }
    );
    expect(changedApproval.error).not.toBeNull();
    const prePublicationEligibility = await rpc(
      admin,
      "get_catalog_review_eligibility",
      { p_case_id: caseId }
    );
    expect(prePublicationEligibility.error).toBeNull();
    expect(prePublicationEligibility.data).toMatchObject({ eligible: false });
    expect(JSON.stringify(prePublicationEligibility.data)).toContain(
      "private_dogfood_owner"
    );

    const publicationArgs = {
      p_publication_id: id("publication-private"),
      p_case_id: caseId,
      p_release_owner_decision_reference: id("owner-decision"),
      p_source_validation_reference: id("source-validation"),
      p_approved_at: "2026-08-08",
      p_next_review_at: "2026-12-31"
    };
    const published = await rpc(
      admin,
      "publish_private_dogfood_revision",
      publicationArgs
    );
    expect(published.error).toBeNull();
    expect(published.data).toMatchObject({
      published: true,
      review_standard: "private_dogfood_owner"
    });
    const publicationReplay = await rpc(
      admin,
      "publish_private_dogfood_revision",
      publicationArgs
    );
    expect(publicationReplay.error).toBeNull();
    expect(publicationReplay.data).toMatchObject({
      published: true,
      replayed: true
    });
    const changedPublication = await rpc(
      admin,
      "publish_private_dogfood_revision",
      {
        ...publicationArgs,
        p_source_validation_reference: id("source-validation-other")
      }
    );
    expect(changedPublication.error).not.toBeNull();

    const anonymousCatalog = await rpc(
      anonymous,
      "list_published_catalog_items"
    );
    expect(anonymousCatalog.error).toBeNull();
    expect(anonymousCatalog.data).toEqual([]);
    const anonymousLegacyList = await rpc(
      anonymous,
      "list_published_preparations"
    );
    expect(anonymousLegacyList.error).toBeNull();
    expect(anonymousLegacyList.data).toEqual([]);
    const anonymousDetail = await rpc(anonymous, "get_published_preparation", {
      p_slug: slug
    });
    expect(anonymousDetail.error).toBeNull();
    expect(anonymousDetail.data).toBeNull();

    const caregiverCatalog = await rpc(
      caregiver,
      "list_published_catalog_items"
    );
    expect(caregiverCatalog.error).toBeNull();
    expect(caregiverCatalog.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slug,
          review_standard: "private_dogfood_owner"
        })
      ])
    );
    const caregiverLegacyList = await rpc(
      caregiver,
      "list_published_preparations"
    );
    expect(caregiverLegacyList.error).toBeNull();
    expect(caregiverLegacyList.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ slug })])
    );
    const caregiverDetail = await rpc(caregiver, "get_published_preparation", {
      p_slug: slug
    });
    expect(caregiverDetail.error).toBeNull();
    expect(caregiverDetail.data).toMatchObject({
      slug,
      review_standard: "private_dogfood_owner"
    });

    const externalEligibility = await rpc(
      admin,
      "get_catalog_review_eligibility",
      { p_case_id: caseId }
    );
    expect(externalEligibility.error).toBeNull();
    expect(externalEligibility.data).toMatchObject({ eligible: false });
    expect(JSON.stringify(externalEligibility.data)).toContain(
      "private_dogfood_owner"
    );

    const qualifiedPublish = await rpc(admin, "publish_catalog_review_case", {
      ...publicationArgs,
      p_publication_id: id("publication-qualified")
    });
    expect(qualifiedPublish.error).not.toBeNull();
  });
});

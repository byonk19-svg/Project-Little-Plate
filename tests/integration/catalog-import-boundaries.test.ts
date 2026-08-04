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

const rpc = async (
  client: SupabaseClient,
  name: string,
  args: Record<string, unknown>
) => client.rpc(name, args);

function ids(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function candidateEnvelope() {
  const suffix = crypto.randomUUID();
  const sourceId = `source-${suffix}`;
  const tagId = `tag-${suffix}`;
  const foodId = `food-${suffix}`;
  const preparationId = `preparation-${suffix}`;
  const revisionId = `revision-${suffix}`;
  const caseId = `case-${suffix}`;
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
          publisher: "Synthetic importer source",
          title: "Synthetic importer reference",
          url: "https://example.test/importer",
          source_date: "2026-08-01",
          accessed_at: "2026-08-04"
        }
      ],
      tags: [{ id: tagId, kind: "skill", label: "Synthetic skill" }],
      foods: [
        {
          id: foodId,
          slug: `food-${suffix}`,
          name: "Synthetic food",
          category: "synthetic"
        }
      ],
      preparations: [
        {
          id: preparationId,
          food_id: foodId,
          slug: `preparation-${suffix}`,
          name: "Synthetic preparation",
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
          tag_ids: [tagId],
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
  return { envelope, caseId, revisionId, sourceId };
}

describe("catalog import RPC boundaries", () => {
  beforeAll(() => {
    status = readLocalSupabaseStatus();
    admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    anonymous = createClient(status.API_URL, status.ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  });

  test("imports a candidate once, replays deterministically, and serializes concurrent retries", async () => {
    const { envelope, caseId, revisionId } = candidateEnvelope();
    const calls = await Promise.all([
      rpc(admin, "import_catalog_candidate_package", { p_envelope: envelope }),
      rpc(admin, "import_catalog_candidate_package", { p_envelope: envelope })
    ]);
    expect(
      calls.every((call) => call.error === null),
      JSON.stringify(calls)
    ).toBe(true);
    expect(calls[0].data).toEqual(calls[1].data);
    expect((calls[0].data as { accepted: boolean }).accepted).toBe(true);

    const { data: cases, error: caseError } = await admin
      .from("catalog_review_cases")
      .select("id, revision_id, status, classification")
      .eq("id", caseId);
    expect(caseError).toBeNull();
    expect(cases).toEqual([
      {
        id: caseId,
        revision_id: revisionId,
        status: "draft",
        classification: "production_candidate"
      }
    ]);

    const changed = await admin
      .from("foods")
      .update({ name: "unsafe mutation" })
      .eq(
        "id",
        (envelope.payload as { foods: Array<{ id: string }> }).foods[0].id
      );
    expect(changed.error?.message).toContain("candidate_snapshot_locked");
  });

  test("rejects digest conflicts, forbidden access, and leaves public reads empty", async () => {
    const { envelope } = candidateEnvelope();
    const conflict = structuredClone(envelope) as Record<string, unknown>;
    conflict.payload_digest = "sha256:" + "0".repeat(64);
    const rejected = await rpc(admin, "import_catalog_candidate_package", {
      p_envelope: conflict
    });
    expect(rejected.error?.message).toContain("package_digest_conflict");

    const forbidden = structuredClone(envelope) as Record<string, unknown>;
    forbidden.classification = "production";
    forbidden.payload_digest = canonicalizeCatalogImport(forbidden).digest;
    const forbiddenResult = await rpc(
      admin,
      "import_catalog_candidate_package",
      {
        p_envelope: forbidden
      }
    );
    expect(forbiddenResult.error?.message).toContain("invalid_classification");

    const publicRead = await anonymous.from("foods").select("id");
    expect(publicRead.error).not.toBeNull();
    expect(publicRead.data).toBeNull();
  });

  test("imports a qualified review packet with evidence and approval reference, then replays", async () => {
    const {
      envelope: candidate,
      caseId,
      revisionId,
      sourceId
    } = candidateEnvelope();
    expect(
      (
        await rpc(admin, "import_catalog_candidate_package", {
          p_envelope: candidate
        })
      ).error
    ).toBeNull();
    const authority = ids("authority");
    expect(
      (
        await rpc(admin, "register_catalog_reviewer_authority", {
          p_reference: authority,
          p_authority_basis: "Synthetic qualified authority",
          p_evidence_location: `https://example.test/${authority}`,
          p_dimensions: ["storage_handling"]
        })
      ).error
    ).toBeNull();

    const packet: Record<string, unknown> = {
      schema_version: "qualified-review-packet/v1",
      package_id: ids("review"),
      package_version: "1",
      package_created_at: "2026-08-04T12:00:00Z",
      case_id: caseId,
      revision_id: revisionId,
      classification: "production_candidate",
      submissions: [
        {
          id: ids("submission"),
          dimension: "storage_handling",
          decision: "Accept",
          reviewer_role: "synthetic qualified reviewer",
          reviewer_authority_reference: authority,
          reviewed_at: "2026-08-04",
          approval_reference_id: ids("approval"),
          follow_up_status: "none",
          clarification_requires_catalog_change: false,
          storage_support_state: "unsupported",
          storage_context: {},
          visual_context: {},
          supersedes_submission_id: null,
          evidence: [
            {
              id: ids("evidence"),
              field_or_claim: "storage_support_state",
              evidence_reference: "https://example.test/evidence",
              source_id: sourceId
            }
          ]
        }
      ]
    };
    packet.payload_digest = canonicalizeCatalogImport(packet).digest;
    const first = await rpc(admin, "import_catalog_review_packet", {
      p_envelope: packet
    });
    expect(first.error).toBeNull();
    expect((first.data as { status: string }).status).toBe("in_review");
    const replay = await rpc(admin, "import_catalog_review_packet", {
      p_envelope: packet
    });
    expect(replay.error).toBeNull();
    expect(replay.data).toEqual(first.data);

    const { data: approvals, error: approvalError } = await admin
      .from("catalog_review_submission_approval_references")
      .select("submission_id, approval_reference_id");
    expect(approvalError).toBeNull();
    expect(approvals).toHaveLength(1);
  });
});

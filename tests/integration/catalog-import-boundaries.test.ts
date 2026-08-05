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

type JsonRecord = Record<string, unknown>;
type MutableCandidateRevision = JsonRecord & {
  storage_rules: JsonRecord[];
};
type MutableCandidateEnvelope = JsonRecord & {
  payload: {
    sources: JsonRecord[];
    tags: JsonRecord[];
    foods: JsonRecord[];
    preparations: JsonRecord[];
    revisions: MutableCandidateRevision[];
    visuals: JsonRecord[];
  };
  review_cases: JsonRecord[];
};
type MutableReviewPacket = JsonRecord & {
  submissions: Array<
    JsonRecord & {
      evidence: JsonRecord[];
    }
  >;
};

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
    expect(changed.error === null || changed.error.code === "55000").toBe(true);
    const unchanged = await admin
      .from("foods")
      .select("name")
      .eq(
        "id",
        (envelope.payload as { foods: Array<{ id: string }> }).foods[0].id
      )
      .single();
    expect(unchanged.error).toBeNull();
    expect(unchanged.data?.name).toBe("Synthetic food");
  });

  test("rejects digest conflicts, forbidden access, and leaves public reads empty", async () => {
    const { envelope } = candidateEnvelope();
    const conflict = structuredClone(envelope) as Record<string, unknown>;
    conflict.payload_digest = "sha256:" + "0".repeat(64);
    const rejected = await rpc(admin, "import_catalog_candidate_package", {
      p_envelope: conflict
    });
    expect(rejected.error).toBeNull();
    expect(rejected.data).toEqual({
      accepted: false,
      rejections: [expect.objectContaining({ code: "package_digest_conflict" })]
    });

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
    expect(forbiddenResult.error).toBeNull();
    expect(forbiddenResult.data).toMatchObject({ accepted: false });
    expect(forbiddenResult.data.rejections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "invalid_classification" })
      ])
    );

    const publicRead = await anonymous.from("foods").select("id");
    expect(publicRead.error).not.toBeNull();
    expect(publicRead.data).toBeNull();
  });

  test("returns ordered shape rejections before candidate writes", async () => {
    const { envelope } = candidateEnvelope();
    const malformed = structuredClone(envelope) as Record<string, unknown> & {
      payload: {
        sources: Array<Record<string, unknown>>;
        foods: Array<Record<string, unknown>>;
        preparations: Array<Record<string, unknown>>;
        revisions: Array<Record<string, unknown>>;
      };
      review_cases: Array<Record<string, unknown>>;
    };
    malformed.payload.sources[0].unexpected = true;
    malformed.payload.foods[0].id = ` ${malformed.payload.foods[0].id}`;
    malformed.payload_digest = canonicalizeCatalogImport(malformed).digest;

    const rejected = await rpc(admin, "import_catalog_candidate_package", {
      p_envelope: malformed
    });
    expect(rejected.error).toBeNull();
    expect(rejected.data).toMatchObject({ accepted: false });
    expect(rejected.data.rejections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          collection: "foods",
          field_path: "id",
          code: "unstable_identifier"
        }),
        expect.objectContaining({
          collection: "sources",
          field_path: "unexpected",
          code: "invalid_envelope_shape"
        }),
        expect.objectContaining({
          collection: "preparations",
          field_path: "food_id",
          code: "unknown_source"
        })
      ])
    );
    const rows = await admin
      .from("foods")
      .select("id")
      .eq("id", String(malformed.payload.foods[0].id));
    expect(rows.error).toBeNull();
    expect(rows.data).toEqual([]);

    const identityChecks = [
      ["sources", String(malformed.payload.sources[0].id)],
      ["preparations", String(malformed.payload.preparations[0].id)],
      ["content_revisions", String(malformed.payload.revisions[0].id)],
      ["catalog_review_cases", String(malformed.review_cases[0].case_id)]
    ] as const;
    for (const [table, id] of identityChecks) {
      const result = await admin.from(table).select("id").eq("id", id);
      expect(result.error).toBeNull();
      expect(result.data).toEqual([]);
    }
    const receipt = await admin
      .from("catalog_import_receipts")
      .select("package_id")
      .eq("package_id", String(malformed.package_id));
    expect(receipt.error).toBeNull();
    expect(receipt.data).toEqual([]);
  });

  test("normalizes malformed candidate values and rejects required visuals atomically", async () => {
    const { envelope } = candidateEnvelope();
    const malformed = structuredClone(envelope) as MutableCandidateEnvelope;
    malformed.package_created_at = "2026-99-99T12:00:00Z";
    malformed.payload.sources[0].source_date = "2026-02-30";
    malformed.payload.tags[0].kind = "medical";
    malformed.payload.revisions[0].preparation_time_band = "whenever";
    malformed.payload.revisions[0].storage_rules[0] = {
      id: "bad-storage-rule",
      support_status: "supported",
      deadline_kind: null,
      duration_hours: null,
      guidance: null
    };
    malformed.payload_digest = canonicalizeCatalogImport(malformed).digest;
    const rejected = await rpc(admin, "import_catalog_candidate_package", {
      p_envelope: malformed
    });
    expect(rejected.error).toBeNull();
    expect(rejected.data.rejections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "invalid_envelope_shape" }),
        expect.objectContaining({ code: "invalid_storage_contract" })
      ])
    );
    expect(
      rejected.data.rejections.some((item: JsonRecord) => item.detail)
    ).toBe(false);
    const requiredVisual = structuredClone(
      envelope
    ) as MutableCandidateEnvelope;
    requiredVisual.package_id = ids("candidate-required-visual");
    requiredVisual.payload.revisions[0].visual_required = true;
    requiredVisual.payload_digest =
      canonicalizeCatalogImport(requiredVisual).digest;
    const visualRejected = await rpc(
      admin,
      "import_catalog_candidate_package",
      {
        p_envelope: requiredVisual
      }
    );
    expect(visualRejected.error).toBeNull();
    expect(visualRejected.data.rejections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "invalid_visual_contract" })
      ])
    );
    const receipt = await admin
      .from("catalog_import_receipts")
      .select("package_id")
      .eq("package_id", requiredVisual.package_id);
    expect(receipt.data).toEqual([]);
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
    const forbidden = structuredClone(packet) as Record<string, unknown>;
    forbidden.owner_adjudications = [];
    forbidden.payload_digest = canonicalizeCatalogImport(forbidden).digest;
    const forbiddenResult = await rpc(admin, "import_catalog_review_packet", {
      p_envelope: forbidden
    });
    expect(forbiddenResult.error).toBeNull();
    expect(forbiddenResult.data).toMatchObject({ accepted: false });
    expect(forbiddenResult.data.rejections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "owner_adjudication_forbidden_in_packet"
        })
      ])
    );
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
      .select("submission_id, approval_reference_id")
      .eq("submission_id", (packet.submissions as Array<{ id: string }>)[0].id);
    expect(approvalError).toBeNull();
    if (!approvals) throw new Error("approval rows were not returned");
    expect(approvals).toHaveLength(1);
    expect(approvals[0].approval_reference_id).toBe(
      (packet.submissions as Array<{ approval_reference_id: string }>)[0]
        .approval_reference_id
    );
  });

  test("returns structured review rejections without persisting context values", async () => {
    const candidate = candidateEnvelope();
    expect(
      (
        await rpc(admin, "import_catalog_candidate_package", {
          p_envelope: candidate.envelope
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
    const packet: MutableReviewPacket = {
      schema_version: "qualified-review-packet/v1",
      package_id: ids("review-invalid"),
      package_version: "1",
      package_created_at: "2026-08-04T12:00:00Z",
      case_id: candidate.caseId,
      revision_id: candidate.revisionId,
      classification: "production_candidate",
      submissions: [
        {
          id: ids("submission-invalid"),
          dimension: "storage_handling",
          decision: "Unknown decision",
          reviewer_role: "synthetic qualified reviewer",
          reviewer_authority_reference: authority,
          reviewed_at: "2026-99-99",
          approval_reference_id: ids("approval-invalid"),
          follow_up_status: "later",
          clarification_requires_catalog_change: false,
          storage_support_state: "unsupported",
          storage_context: { secret: "do-not-persist" },
          visual_context: {},
          supersedes_submission_id: null,
          evidence: [
            {
              id: ids("evidence-invalid"),
              field_or_claim: "storage_support_state",
              evidence_reference: "https://example.test/evidence"
            }
          ]
        }
      ]
    };
    packet.payload_digest = canonicalizeCatalogImport(packet).digest;
    const rejected = await rpc(admin, "import_catalog_review_packet", {
      p_envelope: packet
    });
    expect(rejected.error).toBeNull();
    expect(rejected.data.rejections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field_path: "decision",
          code: "invalid_envelope_shape"
        }),
        expect.objectContaining({
          field_path: "follow_up_status",
          code: "invalid_envelope_shape"
        }),
        expect.objectContaining({
          field_path: "reviewed_at",
          code: "invalid_envelope_shape"
        }),
        expect.objectContaining({
          field_path: "storage_context.secret",
          code: "invalid_envelope_shape"
        })
      ])
    );
    expect(JSON.stringify(rejected.data)).not.toContain("do-not-persist");
    const receipt = await admin
      .from("catalog_import_receipts")
      .select("package_id")
      .eq("package_id", packet.package_id);
    expect(receipt.data).toEqual([]);
  });

  test("keeps blocked cases blocked when a clearing round is imported", async () => {
    const candidate = candidateEnvelope();
    expect(
      (
        await rpc(admin, "import_catalog_candidate_package", {
          p_envelope: candidate.envelope
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
    const submission = {
      id: ids("submission"),
      dimension: "storage_handling",
      decision: "Block",
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
          evidence_reference: "https://example.test/evidence"
        }
      ]
    };
    const packet: Record<string, unknown> = {
      schema_version: "qualified-review-packet/v1",
      package_id: ids("review"),
      package_version: "1",
      package_created_at: "2026-08-04T12:00:00Z",
      case_id: candidate.caseId,
      revision_id: candidate.revisionId,
      classification: "production_candidate",
      submissions: [submission]
    };
    packet.payload_digest = canonicalizeCatalogImport(packet).digest;
    expect(
      (await rpc(admin, "import_catalog_review_packet", { p_envelope: packet }))
        .error
    ).toBeNull();
    expect(
      (
        await rpc(admin, "transition_catalog_review_case", {
          p_case_id: candidate.caseId,
          p_target_status: "blocked",
          p_reason: "qualified block"
        })
      ).error
    ).toBeNull();

    const clearingPacket = structuredClone(packet) as Record<string, unknown>;
    clearingPacket.package_id = ids("review-clearing");
    const clearingSubmission = structuredClone(submission) as Record<
      string,
      unknown
    >;
    clearingSubmission.id = ids("submission-clearing");
    clearingSubmission.decision = "Accept";
    clearingSubmission.supersedes_submission_id = submission.id;
    clearingSubmission.approval_reference_id = ids("approval-clearing");
    clearingSubmission.evidence = [
      {
        id: ids("evidence-clearing"),
        field_or_claim: "storage_support_state",
        evidence_reference: "https://example.test/evidence-clearing"
      }
    ];
    clearingPacket.submissions = [clearingSubmission];
    clearingPacket.payload_digest =
      canonicalizeCatalogImport(clearingPacket).digest;
    const imported = await rpc(admin, "import_catalog_review_packet", {
      p_envelope: clearingPacket
    });
    expect(imported.error).toBeNull();
    const state = await admin
      .from("catalog_review_cases")
      .select("status")
      .eq("id", candidate.caseId);
    expect(state.data).toEqual([{ status: "blocked" }]);
  });

  test("rejects a later round when more than one current review tip exists", async () => {
    const candidate = candidateEnvelope();
    expect(
      (
        await rpc(admin, "import_catalog_candidate_package", {
          p_envelope: candidate.envelope
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
    const firstId = ids("submission");
    const firstPacket: MutableReviewPacket = {
      schema_version: "qualified-review-packet/v1",
      package_id: ids("review-tip"),
      package_version: "1",
      package_created_at: "2026-08-04T12:00:00Z",
      case_id: candidate.caseId,
      revision_id: candidate.revisionId,
      classification: "production_candidate",
      submissions: [
        {
          id: firstId,
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
              evidence_reference: "https://example.test/evidence"
            }
          ]
        }
      ]
    };
    firstPacket.payload_digest = canonicalizeCatalogImport(firstPacket).digest;
    expect(
      (
        await rpc(admin, "import_catalog_review_packet", {
          p_envelope: firstPacket
        })
      ).error
    ).toBeNull();
    const secondDirect = await rpc(admin, "submit_catalog_review", {
      p_submission_id: ids("direct-tip"),
      p_case_id: candidate.caseId,
      p_revision_id: candidate.revisionId,
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
    expect(secondDirect.error).toBeNull();
    const later: MutableReviewPacket = structuredClone(firstPacket);
    later.package_id = ids("review-ambiguous");
    later.submissions[0].id = ids("submission-later");
    later.submissions[0].supersedes_submission_id = firstId;
    later.submissions[0].approval_reference_id = ids("approval-later");
    later.submissions[0].evidence[0].id = ids("evidence-later");
    later.payload_digest = canonicalizeCatalogImport(later).digest;
    const rejected = await rpc(admin, "import_catalog_review_packet", {
      p_envelope: later
    });
    expect(rejected.error).toBeNull();
    expect(rejected.data.rejections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "duplicate_effective_submission" })
      ])
    );
  });

  test("replays an exact completed packet but rejects a new packet", async () => {
    const candidate = candidateEnvelope();
    expect(
      (
        await rpc(admin, "import_catalog_candidate_package", {
          p_envelope: candidate.envelope
        })
      ).error
    ).toBeNull();
    const authority = ids("authority");
    const dimensions = [
      "feeding_safety_developmental",
      "allergy_restriction",
      "nutrition_age_stage",
      "taxonomy_labeling",
      "storage_handling"
    ];
    expect(
      (
        await rpc(admin, "register_catalog_reviewer_authority", {
          p_reference: authority,
          p_authority_basis: "Synthetic qualified authority",
          p_evidence_location: `https://example.test/${authority}`,
          p_dimensions: dimensions
        })
      ).error
    ).toBeNull();
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
          evidence_reference: `https://example.test/${dimension}`
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
    const imported = await rpc(admin, "import_catalog_review_packet", {
      p_envelope: packet
    });
    expect(imported.error).toBeNull();
    const completed = await rpc(admin, "transition_catalog_review_case", {
      p_case_id: candidate.caseId,
      p_target_status: "completed",
      p_reason: "qualified dimensions complete"
    });
    expect(completed.error).toBeNull();
    const replay = await rpc(admin, "import_catalog_review_packet", {
      p_envelope: packet
    });
    expect(replay.error).toBeNull();
    expect(replay.data).toEqual(imported.data);
    const newPacket = structuredClone(packet) as Record<string, unknown>;
    newPacket.package_id = ids("review-new");
    newPacket.payload_digest = canonicalizeCatalogImport(newPacket).digest;
    const rejected = await rpc(admin, "import_catalog_review_packet", {
      p_envelope: newPacket
    });
    expect(rejected.error).toBeNull();
    expect(rejected.data).toEqual({
      accepted: false,
      rejections: [expect.objectContaining({ code: "review_case_completed" })]
    });
  });
});

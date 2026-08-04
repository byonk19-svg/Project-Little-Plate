import { describe, expect, test } from "vitest";

import {
  CatalogImportValidationError,
  canonicalizeCatalogImport,
  parseCatalogImportJson
} from "./canonical";

const envelope = {
  schema_version: "candidate-package/v1",
  package_id: "candidate-1",
  package_version: "1",
  package_created_at: "2026-08-04T12:00:00Z",
  classification: "production_candidate",
  payload_digest: "sha256:placeholder",
  review_cases: [
    { case_id: "case-2", revision_id: "revision-2" },
    { case_id: "case-1", revision_id: "revision-1" }
  ],
  payload: {
    sources: [],
    tags: [],
    foods: [],
    preparations: [],
    revisions: [],
    visuals: []
  }
};

describe("catalog import canonicalization", () => {
  test("sorts object keys and identity-bearing arrays without changing the digest", () => {
    const left = canonicalizeCatalogImport(envelope);
    const right = canonicalizeCatalogImport({
      payload: { ...envelope.payload },
      payload_digest: "different-client-value",
      classification: envelope.classification,
      package_created_at: envelope.package_created_at,
      package_version: envelope.package_version,
      package_id: envelope.package_id,
      schema_version: envelope.schema_version,
      review_cases: [...envelope.review_cases].reverse()
    });
    expect(right.canonical).toBe(left.canonical);
    expect(right.digest).toBe(left.digest);
  });

  test("keeps meaningful arrays ordered and omitted values distinct from null", () => {
    const ordered = canonicalizeCatalogImport({
      ...envelope,
      payload: { ...envelope.payload, ordered: ["b", "a"] }
    });
    const reordered = canonicalizeCatalogImport({
      ...envelope,
      payload: { ...envelope.payload, ordered: ["a", "b"] }
    });
    expect(ordered.digest).not.toBe(reordered.digest);
    expect(
      canonicalizeCatalogImport({
        ...envelope,
        payload: { ...envelope.payload, value: null }
      }).digest
    ).not.toBe(
      canonicalizeCatalogImport({
        ...envelope,
        payload: { ...envelope.payload }
      }).digest
    );
  });

  test("rejects duplicate raw object keys before JSON parsing collapses them", () => {
    expect(() =>
      parseCatalogImportJson('{"package_id":"one","package_id":"two"}')
    ).toThrowError(CatalogImportValidationError);
  });

  test("rejects exponent, fraction, leading-zero, and negative-zero numeric forms", () => {
    for (const raw of ["1e0", "1.0", "01", "-0"]) {
      expect(() =>
        parseCatalogImportJson(`{"package_version":${raw}}`)
      ).toThrowError(CatalogImportValidationError);
    }
  });

  test("preserves Unicode and escaped strings in UTF-8 canonical material", () => {
    const result = canonicalizeCatalogImport({
      ...envelope,
      label: "café 🍐\\n"
    });
    expect(result.canonical).toContain('"label":"café 🍐');
    expect(result.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

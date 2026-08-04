import { createHash } from "node:crypto";

export type ImportKind = "candidate_package" | "qualified_review_packet";

export class CatalogImportValidationError extends Error {
  readonly code: string;

  constructor(code: string, message = code) {
    super(message);
    this.name = "CatalogImportValidationError";
    this.code = code;
  }
}

const identityArrayKeys = new Set([
  "sources",
  "tags",
  "foods",
  "preparations",
  "revisions",
  "visuals",
  "review_cases",
  "submissions",
  "evidence",
  "tag_ids",
  "visual_ids",
  "storage_rules"
]);

const identityKeyByArrayKey: Record<string, string> = {
  review_cases: "case_id"
};

const utf8Compare = (left: string, right: string) => {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const length = Math.min(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    if (leftBytes[index] !== rightBytes[index]) {
      return leftBytes[index] - rightBytes[index];
    }
  }
  return leftBytes.length - rightBytes.length;
};

function stableId(value: unknown, arrayKey?: string) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    if (typeof id === "string" && id.length > 0) return id;
  }
  const identityKey = arrayKey ? identityKeyByArrayKey[arrayKey] : undefined;
  if (
    identityKey &&
    value &&
    typeof value === "object" &&
    identityKey in value
  ) {
    const id = (value as Record<string, unknown>)[identityKey];
    if (typeof id === "string" && id.length > 0) return id;
  }
  return null;
}

function assertUniqueStableIds(
  value: unknown,
  path: string,
  arrayKey?: string
) {
  if (!Array.isArray(value)) return;
  const ids = value
    .map((item) => stableId(item, arrayKey))
    .filter((id): id is string => id !== null);
  if (ids.length !== value.length) return;
  const seen = new Set<string>();
  ids.forEach((id, index) => {
    if (seen.has(id)) {
      throw new CatalogImportValidationError(
        "unstable_identifier",
        `Duplicate stable identifier at ${path}[${index}]: ${id}`
      );
    }
    seen.add(id);
  });
}

function canonicalValue(value: unknown, key?: string): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || !Number.isFinite(value)) {
      throw new CatalogImportValidationError(
        "unstable_identifier",
        "Only finite safe integers are canonical"
      );
    }
    if (Object.is(value, -0)) {
      throw new CatalogImportValidationError(
        "unstable_identifier",
        "Negative zero is not canonical"
      );
    }
    return String(value);
  }
  if (Array.isArray(value)) {
    assertUniqueStableIds(value, key ?? "array", key);
    const items = value.map((item) => canonicalValue(item));
    if (key && identityArrayKeys.has(key)) {
      return `[${value
        .map((item) => ({
          id: stableId(item, key) ?? "",
          bytes: canonicalValue(item)
        }))
        .sort(
          (left, right) =>
            utf8Compare(left.id, right.id) ||
            utf8Compare(left.bytes, right.bytes)
        )
        .map((item) => item.bytes)
        .join(",")}]`;
    }
    return `[${items.join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => utf8Compare(left, right))
      .map(
        ([entryKey, entryValue]) =>
          `${JSON.stringify(entryKey)}:${canonicalValue(entryValue, entryKey)}`
      );
    return `{${entries.join(",")}}`;
  }
  throw new CatalogImportValidationError(
    "unstable_identifier",
    "Unsupported JSON value"
  );
}

function canonicalMaterial(envelope: Record<string, unknown>) {
  const material = Object.fromEntries(
    Object.entries(envelope).filter(([key]) => key !== "payload_digest")
  );
  return canonicalValue(material);
}

function rejectDuplicateObjectKeys(raw: string) {
  let index = 0;
  const length = raw.length;
  const skipWhitespace = () => {
    while (index < length && /\s/.test(raw[index])) index += 1;
  };
  const parseString = () => {
    if (raw[index] !== '"')
      throw new CatalogImportValidationError(
        "invalid_envelope_shape",
        "Expected JSON string"
      );
    const start = index;
    index += 1;
    while (index < length) {
      const char = raw[index];
      if (char === "\\") {
        index += 2;
        continue;
      }
      index += 1;
      if (char === '"') return JSON.parse(raw.slice(start, index)) as string;
    }
    throw new CatalogImportValidationError(
      "invalid_envelope_shape",
      "Unterminated JSON string"
    );
  };
  const parseValue = (): void => {
    skipWhitespace();
    if (raw[index] === "{") {
      index += 1;
      skipWhitespace();
      const keys = new Set<string>();
      if (raw[index] === "}") {
        index += 1;
        return;
      }
      while (index < length) {
        skipWhitespace();
        const key = parseString();
        if (keys.has(key))
          throw new CatalogImportValidationError(
            "invalid_envelope_shape",
            `Duplicate JSON object key: ${key}`
          );
        keys.add(key);
        skipWhitespace();
        if (raw[index++] !== ":")
          throw new CatalogImportValidationError(
            "invalid_envelope_shape",
            "Expected object separator"
          );
        parseValue();
        skipWhitespace();
        if (raw[index] === "}") {
          index += 1;
          return;
        }
        if (raw[index++] !== ",")
          throw new CatalogImportValidationError(
            "invalid_envelope_shape",
            "Expected object comma"
          );
      }
      throw new CatalogImportValidationError(
        "invalid_envelope_shape",
        "Unterminated JSON object"
      );
    }
    if (raw[index] === "[") {
      index += 1;
      skipWhitespace();
      if (raw[index] === "]") {
        index += 1;
        return;
      }
      while (index < length) {
        parseValue();
        skipWhitespace();
        if (raw[index] === "]") {
          index += 1;
          return;
        }
        if (raw[index++] !== ",")
          throw new CatalogImportValidationError(
            "invalid_envelope_shape",
            "Expected array comma"
          );
      }
      throw new CatalogImportValidationError(
        "invalid_envelope_shape",
        "Unterminated JSON array"
      );
    }
    if (raw[index] === '"') {
      parseString();
      return;
    }
    const start = index;
    while (index < length && !/[\s,\]}]/.test(raw[index])) index += 1;
    const token = raw.slice(start, index);
    if (token === "-0")
      throw new CatalogImportValidationError(
        "invalid_envelope_shape",
        "Negative zero is not canonical"
      );
    if (/^-?(?:0|[1-9]\d*)$/.test(token)) return;
    if (/^-?\d/.test(token))
      throw new CatalogImportValidationError(
        "invalid_envelope_shape",
        `Non-canonical numeric form: ${token}`
      );
    if (!["true", "false", "null"].includes(token))
      throw new CatalogImportValidationError(
        "invalid_envelope_shape",
        `Invalid JSON token: ${token}`
      );
  };
  parseValue();
  skipWhitespace();
  if (index !== length)
    throw new CatalogImportValidationError(
      "invalid_envelope_shape",
      "Trailing JSON content"
    );
}

export function parseCatalogImportJson(raw: string): Record<string, unknown> {
  rejectDuplicateObjectKeys(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new CatalogImportValidationError(
      "invalid_envelope_shape",
      "Import envelope is not valid JSON"
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CatalogImportValidationError(
      "invalid_envelope_shape",
      "Import envelope must be an object"
    );
  }
  return parsed as Record<string, unknown>;
}

export function canonicalizeCatalogImport(envelope: Record<string, unknown>) {
  const canonical = canonicalMaterial(envelope);
  return {
    canonical,
    digest: `sha256:${createHash("sha256").update(Buffer.from(canonical, "utf8")).digest("hex")}`
  };
}

export function canonicalizeCatalogImportJson(raw: string) {
  return canonicalizeCatalogImport(parseCatalogImportJson(raw));
}

export function validateEnvelopeShape(
  envelope: Record<string, unknown>,
  kind: ImportKind
) {
  const schemaVersion = envelope.schema_version;
  const expected =
    kind === "candidate_package"
      ? "candidate-package/v1"
      : "qualified-review-packet/v1";
  if (schemaVersion !== expected)
    throw new CatalogImportValidationError("unsupported_schema_version");
  if (
    typeof envelope.package_id !== "string" ||
    typeof envelope.package_version !== "string" ||
    typeof envelope.package_created_at !== "string"
  ) {
    throw new CatalogImportValidationError("package_identity_missing");
  }
  if (envelope.classification !== "production_candidate")
    throw new CatalogImportValidationError("invalid_classification");
  const { digest } = canonicalizeCatalogImport(envelope);
  if (envelope.payload_digest !== digest)
    throw new CatalogImportValidationError("package_digest_conflict");
  return envelope;
}

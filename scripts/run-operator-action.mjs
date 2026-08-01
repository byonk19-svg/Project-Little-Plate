import process from "node:process";
import { createHash } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

function usage() {
  throw new Error(
    "Usage: node scripts/run-operator-action.mjs retire-content <revision-id> <incident-reference> <reason> | set-generation <disabled|enabled> <incident-reference> <reason>"
  );
}

const [action, target, incidentReference, ...reasonParts] =
  process.argv.slice(2);
const reason = reasonParts.join(" ").trim();
const url = process.env.LITTLE_PLATE_SUPABASE_URL?.trim();
const serviceRoleKey =
  process.env.LITTLE_PLATE_SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!url || !serviceRoleKey) {
  throw new Error(
    "LITTLE_PLATE_SUPABASE_URL and LITTLE_PLATE_SUPABASE_SERVICE_ROLE_KEY are required."
  );
}
if (
  !incidentReference ||
  incidentReference.length > 120 ||
  !reason ||
  reason.length > 500
) {
  usage();
}

const client = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const keyHex = createHash("sha256")
  .update(JSON.stringify([action, target, incidentReference, reason]))
  .digest("hex")
  .slice(0, 32);
const idempotencyKey = [
  keyHex.slice(0, 8),
  keyHex.slice(8, 12),
  `4${keyHex.slice(13, 16)}`,
  `8${keyHex.slice(17, 20)}`,
  keyHex.slice(20)
].join("-");

let response;
if (action === "retire-content" && target) {
  response = await client.rpc("emergency_retire_content_revision", {
    p_revision_id: target,
    p_incident_reference: incidentReference,
    p_reason: reason,
    p_idempotency_key: idempotencyKey
  });
} else if (
  action === "set-generation" &&
  (target === "disabled" || target === "enabled")
) {
  response = await client.rpc("set_operational_control", {
    p_control_key: "automatic_generation",
    p_disabled: target === "disabled",
    p_incident_reference: incidentReference,
    p_reason: reason,
    p_idempotency_key: idempotencyKey
  });
} else {
  usage();
}

if (response.error) {
  throw new Error(
    `Operator action failed (${response.error.code ?? "unknown"}): ${response.error.message}`
  );
}

process.stdout.write(
  `${JSON.stringify({ idempotencyKey, result: response.data }, null, 2)}\n`
);

import { execFileSync } from "node:child_process";
import process from "node:process";

const statusCommand =
  process.platform === "win32"
    ? {
        file: "cmd.exe",
        args: ["/d", "/s", "/c", "pnpm exec supabase status -o json"]
      }
    : {
        file: "pnpm",
        args: ["exec", "supabase", "status", "-o", "json"]
      };
const status = JSON.parse(
  execFileSync(statusCommand.file, statusCommand.args, {
    encoding: "utf8"
  })
);
const apiUrl = new URL(status.API_URL);
if (apiUrl.hostname !== "127.0.0.1" && apiUrl.hostname !== "localhost") {
  throw new Error(
    `Restore rehearsal is local-only; refusing Supabase URL ${apiUrl.origin}.`
  );
}

const database = `little_plate_restore_${Date.now()}`;
if (!/^little_plate_restore_\d+$/.test(database)) {
  throw new Error("Unsafe restore rehearsal database name.");
}
const dumpPath = `/tmp/${database}.dump`;
const container = "supabase_db_mealboard-baby";
const docker = (...args) =>
  execFileSync("docker", ["exec", container, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"]
  });
const proofQuery = `
  select json_build_object(
    'households', (select count(*) from public.households),
    'babies', (select count(*) from public.babies),
    'auth_users', (select count(*) from auth.users),
    'product_events', (select count(*) from public.product_events),
    'migration_count', (
      select count(*) from supabase_migrations.schema_migrations
    ),
    'rls_table_count', (
      select count(*)
      from pg_class
      join pg_namespace on pg_namespace.oid = pg_class.relnamespace
      where pg_namespace.nspname = 'public'
        and pg_class.relkind = 'r'
        and pg_class.relrowsecurity
    ),
    'policy_count', (
      select count(*) from pg_policies where schemaname = 'public'
    ),
    'auth_users_table', to_regclass('auth.users') is not null,
    'households_table', to_regclass('public.households') is not null,
    'deletion_function',
      to_regprocedure('public.delete_caregiver_account(text,uuid)') is not null,
    'retirement_function',
      to_regprocedure(
        'public.emergency_retire_content_revision(text,text,text,uuid)'
      ) is not null,
    'caregiver_can_delete',
      has_function_privilege(
        'authenticated',
        'public.delete_caregiver_account(text,uuid)',
        'execute'
      ),
    'caregiver_can_retire',
      has_function_privilege(
        'authenticated',
        'public.emergency_retire_content_revision(text,text,text,uuid)',
        'execute'
      )
  );
`;

try {
  const sourceProof = JSON.parse(
    docker(
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-Atc",
      proofQuery
    ).trim()
  );
  docker(
    "pg_dump",
    "-Fc",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "--schema=public",
    "--schema=auth",
    "--schema=supabase_migrations",
    "-f",
    dumpPath
  );
  docker("createdb", "-U", "postgres", database);
  docker(
    "psql",
    "-U",
    "postgres",
    "-d",
    database,
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    "drop schema public;"
  );
  docker(
    "pg_restore",
    "--no-owner",
    "-U",
    "supabase_admin",
    "-d",
    database,
    dumpPath
  );
  const proof = docker(
    "psql",
    "-U",
    "postgres",
    "-d",
    database,
    "-Atc",
    proofQuery
  ).trim();
  const parsedProof = JSON.parse(proof);
  if (
    JSON.stringify(parsedProof) !== JSON.stringify(sourceProof) ||
    !parsedProof.auth_users_table ||
    !parsedProof.households_table ||
    !parsedProof.deletion_function ||
    !parsedProof.retirement_function ||
    !parsedProof.caregiver_can_delete ||
    parsedProof.caregiver_can_retire ||
    parsedProof.rls_table_count < 1 ||
    parsedProof.policy_count < 1 ||
    parsedProof.migration_count < 1
  ) {
    throw new Error(`Restored database proof failed: ${proof}`);
  }
  process.stdout.write(
    `${JSON.stringify({ status: "restored", database, proof: parsedProof }, null, 2)}\n`
  );
} finally {
  try {
    docker("dropdb", "--force", "-U", "postgres", database);
  } catch {
    // The target may not exist when setup failed.
  }
  try {
    docker("rm", "-f", dumpPath);
  } catch {
    // The dump may not exist when backup creation failed.
  }
}

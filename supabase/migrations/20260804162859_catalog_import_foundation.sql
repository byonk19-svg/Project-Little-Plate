create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated, service_role;

create table public.catalog_import_receipts (
  import_kind text not null check (import_kind in ('candidate_package', 'qualified_review_packet')),
  package_id text not null check (btrim(package_id) <> ''),
  package_version text not null check (btrim(package_version) <> ''),
  schema_version text not null check (btrim(schema_version) <> ''),
  payload_digest text not null check (payload_digest ~ '^sha256:[0-9a-f]{64}$'),
  package_created_at timestamptz not null,
  result_json jsonb not null,
  recorded_at timestamptz not null default now(),
  primary key (import_kind, package_id, package_version)
);

create table public.catalog_review_submission_approval_references (
  submission_id text primary key
    references public.catalog_review_submissions(id) on delete restrict,
  approval_reference_id text not null check (btrim(approval_reference_id) <> ''),
  recorded_at timestamptz not null default now()
);

alter table public.catalog_import_receipts enable row level security;
alter table public.catalog_review_submission_approval_references enable row level security;

revoke all on table public.catalog_import_receipts
  from public, anon, authenticated, service_role;
revoke all on table public.catalog_review_submission_approval_references
  from public, anon, authenticated, service_role;
grant select on table public.catalog_import_receipts to service_role;
grant select on table public.catalog_review_submission_approval_references to service_role;

create or replace function private.prevent_catalog_import_history_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Catalog import history is append-only'
    using errcode = '55000';
end;
$$;

create trigger catalog_import_receipts_append_only
before update or delete on public.catalog_import_receipts
for each row execute function private.prevent_catalog_import_history_changes();

create trigger catalog_review_submission_approval_references_append_only
before update or delete on public.catalog_review_submission_approval_references
for each row execute function private.prevent_catalog_import_history_changes();

create or replace function private.catalog_canonical_jsonb(
  value jsonb,
  array_key text default null
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  value_type text := jsonb_typeof(value);
  result text;
begin
  if value_type = 'object' then
    select coalesce(
      '{' || string_agg(
        to_jsonb(object_key)::text || ':' || private.catalog_canonical_jsonb(object_value, object_key),
        ',' order by convert_to(object_key, 'UTF8')
      ) || '}',
      '{}'
    )
    into result
    from jsonb_each(value) as fields(object_key, object_value);
    return result;
  end if;

  if value_type = 'array' then
    if array_key in (
      'sources', 'tags', 'foods', 'preparations', 'revisions', 'visuals',
      'review_cases', 'submissions', 'evidence', 'tag_ids', 'visual_ids',
      'storage_rules'
    ) then
      select coalesce(
        '[' || string_agg(
          private.catalog_canonical_jsonb(items.item, array_key),
          ',' order by
            convert_to(coalesce(items.item->>'id', items.item #>> '{}', ''), 'UTF8'),
            private.catalog_canonical_jsonb(items.item, array_key)
        ) || ']',
        '[]'
      )
      into result
      from jsonb_array_elements(value) as items(item);
      return result;
    end if;

    select coalesce(
      '[' || string_agg(private.catalog_canonical_jsonb(items.item, null), ',' order by items.ordinality) || ']',
      '[]'
    )
    into result
    from jsonb_array_elements(value) with ordinality as items(item, ordinality);
    return result;
  end if;

  if value_type = 'number'
    and (value::text !~ '^-?(0|[1-9][0-9]*)$' or value::text = '-0') then
    raise exception 'Only finite base-10 integers are canonical'
      using errcode = '22023';
  end if;

  return value::text;
end;
$$;

create or replace function private.catalog_import_digest(p_envelope jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'sha256:' || encode(
    extensions.digest(
      convert_to(private.catalog_canonical_jsonb(p_envelope - 'payload_digest'), 'UTF8'),
      'sha256'
    ),
    'hex'
  );
$$;

create or replace function private.candidate_snapshot_locked(p_revision_id text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.catalog_review_cases
    where catalog_review_cases.revision_id = p_revision_id
  );
$$;

create or replace function private.reject_locked_candidate_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_revision_id text;
  is_locked boolean := false;
begin
  if tg_table_name = 'content_revisions' then
    target_revision_id := coalesce(new.id, old.id);
    is_locked := private.candidate_snapshot_locked(target_revision_id);
  elsif tg_table_name in ('revision_tags', 'storage_rules',
    'revision_catalog_metadata', 'revision_visual_requirements', 'revision_visuals') then
    target_revision_id := coalesce(new.revision_id, old.revision_id);
    is_locked := private.candidate_snapshot_locked(target_revision_id);
  elsif tg_table_name = 'sources' then
    is_locked := exists (
      select 1 from public.content_revisions revision
      where revision.source_id = old.id
        and private.candidate_snapshot_locked(revision.id)
    );
  elsif tg_table_name = 'tags' then
    is_locked := exists (
      select 1 from public.revision_tags revision_tag
      where revision_tag.tag_id = old.id
        and private.candidate_snapshot_locked(revision_tag.revision_id)
    );
  elsif tg_table_name = 'preparations' then
    is_locked := exists (
      select 1 from public.content_revisions revision
      where revision.preparation_id = old.id
        and private.candidate_snapshot_locked(revision.id)
    );
  elsif tg_table_name = 'foods' then
    is_locked := exists (
      select 1
      from public.preparations preparation
      join public.content_revisions revision on revision.preparation_id = preparation.id
      where preparation.food_id = old.id
        and private.candidate_snapshot_locked(revision.id)
    );
  elsif tg_table_name = 'catalog_visuals' then
    is_locked := exists (
      select 1
      from public.revision_visuals revision_visual
      where revision_visual.visual_id = old.id
        and private.candidate_snapshot_locked(revision_visual.revision_id)
    );
  end if;

  if is_locked then
    raise exception 'candidate_snapshot_locked' using errcode = '55000';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger candidate_content_revisions_snapshot_lock
before update or delete on public.content_revisions
for each row execute function private.reject_locked_candidate_snapshot();

create trigger candidate_revision_tags_snapshot_lock
before insert or update or delete on public.revision_tags
for each row execute function private.reject_locked_candidate_snapshot();

create trigger candidate_storage_rules_snapshot_lock
before insert or update or delete on public.storage_rules
for each row execute function private.reject_locked_candidate_snapshot();

create trigger candidate_revision_catalog_metadata_snapshot_lock
before insert or update or delete on public.revision_catalog_metadata
for each row execute function private.reject_locked_candidate_snapshot();

create trigger candidate_revision_visual_requirements_snapshot_lock
before insert or update or delete on public.revision_visual_requirements
for each row execute function private.reject_locked_candidate_snapshot();

create trigger candidate_revision_visuals_snapshot_lock
before insert or update or delete on public.revision_visuals
for each row execute function private.reject_locked_candidate_snapshot();

create trigger candidate_sources_snapshot_lock
before update or delete on public.sources
for each row execute function private.reject_locked_candidate_snapshot();

create trigger candidate_tags_snapshot_lock
before update or delete on public.tags
for each row execute function private.reject_locked_candidate_snapshot();

create trigger candidate_preparations_snapshot_lock
before update or delete on public.preparations
for each row execute function private.reject_locked_candidate_snapshot();

create trigger candidate_foods_snapshot_lock
before update or delete on public.foods
for each row execute function private.reject_locked_candidate_snapshot();

create trigger candidate_catalog_visuals_snapshot_lock
before update or delete on public.catalog_visuals
for each row execute function private.reject_locked_candidate_snapshot();

revoke all on function private.catalog_canonical_jsonb(jsonb, text)
  from public, anon, authenticated, service_role;
revoke all on function private.catalog_import_digest(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.candidate_snapshot_locked(text)
  from public, anon, authenticated, service_role;
revoke all on function private.reject_locked_candidate_snapshot()
  from public, anon, authenticated, service_role;

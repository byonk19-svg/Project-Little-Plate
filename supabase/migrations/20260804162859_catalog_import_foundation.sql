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

create or replace function private.catalog_review_rejections(p_envelope jsonb)
returns jsonb[]
language plpgsql
stable
set search_path = ''
as $$
declare
  rejections jsonb[] := ARRAY[]::jsonb[];
  item jsonb;
  nested jsonb;
  key text;
  record_id text;
  required_key text;
begin
  if p_envelope is null or jsonb_typeof(p_envelope) <> 'object' then
    return array[private.catalog_rejection('package', '', '', 'invalid_envelope_shape')];
  end if;
  foreach key in array private.catalog_unknown_keys(p_envelope, ARRAY[
    'schema_version','package_id','package_version','package_created_at','case_id',
    'revision_id','classification','payload_digest','submissions'
  ]) loop
    rejections := rejections || private.catalog_rejection(
      'package', '', key,
      case when key in ('owner_adjudications','owner_decisions','publication_status','approved_at','catalog_mutations','publication')
        then 'owner_adjudication_forbidden_in_packet' else 'invalid_envelope_shape' end
    );
  end loop;
  foreach required_key in array ARRAY['schema_version','package_id','package_version','package_created_at','case_id','revision_id','classification','payload_digest','submissions'] loop
    if not (p_envelope ? required_key) then
      rejections := rejections || private.catalog_rejection('package', '', required_key, 'package_identity_missing');
    end if;
  end loop;
  if p_envelope->>'schema_version' is not null and p_envelope->>'schema_version' <> 'qualified-review-packet/v1' then
    rejections := rejections || private.catalog_rejection('package', '', 'schema_version', 'unsupported_schema_version');
  end if;
  if p_envelope->>'classification' is not null and p_envelope->>'classification' <> 'production_candidate' then
    rejections := rejections || private.catalog_rejection('package', '', 'classification', 'invalid_classification');
  end if;
  foreach key in array ARRAY['package_id','package_version','case_id','revision_id'] loop
    if coalesce(p_envelope->>key,'') = '' then
      rejections := rejections || private.catalog_rejection('package', '', key, 'package_identity_missing');
    elsif p_envelope->>key <> btrim(p_envelope->>key) or p_envelope->>key !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
      rejections := rejections || private.catalog_rejection('package', p_envelope->>key, key, 'unstable_identifier');
    end if;
  end loop;
  if p_envelope->>'package_created_at' is not null
    and p_envelope->>'package_created_at' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$' then
    rejections := rejections || private.catalog_rejection('package', '', 'package_created_at', 'invalid_envelope_shape');
  end if;
  if p_envelope->>'payload_digest' is not null and p_envelope->>'payload_digest' !~ '^sha256:[0-9a-f]{64}$' then
    rejections := rejections || private.catalog_rejection('package', '', 'payload_digest', 'invalid_envelope_shape');
  elsif p_envelope->>'payload_digest' is not null and private.catalog_import_digest(p_envelope) <> p_envelope->>'payload_digest' then
    rejections := rejections || private.catalog_rejection('package', '', 'payload_digest', 'package_digest_conflict');
  end if;
  if jsonb_typeof(p_envelope->'submissions') <> 'array' then
    rejections := rejections || private.catalog_rejection('submissions', '', '', 'invalid_envelope_shape');
    return rejections;
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_envelope->'submissions') value
    group by value->>'id' having count(*) > 1
  ) then
    rejections := rejections || private.catalog_rejection('submissions', '', 'id', 'unstable_identifier');
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_envelope->'submissions') submission,
      jsonb_array_elements(coalesce(submission->'evidence','[]'::jsonb)) evidence
    group by evidence->>'id' having count(*) > 1
  ) then
    rejections := rejections || private.catalog_rejection('evidence', '', 'id', 'unstable_identifier');
  end if;
  for item in select value from jsonb_array_elements(p_envelope->'submissions') loop
    record_id := coalesce(item->>'id','');
    if jsonb_typeof(item) <> 'object' then
      rejections := rejections || private.catalog_rejection('submissions', record_id, '', 'invalid_envelope_shape');
      continue;
    end if;
    foreach key in array private.catalog_unknown_keys(item, ARRAY[
      'id','dimension','decision','reviewer_role','reviewer_authority_reference','reviewed_at',
      'approval_reference_id','follow_up_status','clarification_requires_catalog_change',
      'storage_support_state','storage_context','visual_context','supersedes_submission_id','evidence'
    ]) loop
      rejections := rejections || private.catalog_rejection('submissions', record_id, key, 'invalid_envelope_shape');
    end loop;
    if item ? 'notes' then
      rejections := rejections || private.catalog_rejection('submissions', record_id, 'notes', 'invalid_envelope_shape', 'notes are not accepted in review packet v1');
    end if;
    if record_id = '' or record_id <> btrim(record_id) or record_id !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
      rejections := rejections || private.catalog_rejection('submissions', record_id, 'id', 'unstable_identifier');
    end if;
    if not private.catalog_valid_bounded_text(item->>'reviewer_role', 128) then
      rejections := rejections || private.catalog_rejection('submissions', record_id, 'reviewer_role', 'invalid_envelope_shape');
    end if;
    if coalesce(item->>'reviewed_at','') !~ '^\d{4}-\d{2}-\d{2}$'
      or jsonb_typeof(item->'clarification_requires_catalog_change') <> 'boolean' then
      rejections := rejections || private.catalog_rejection('submissions', record_id, 'reviewed_at', 'invalid_envelope_shape');
    end if;
    foreach key in array ARRAY['reviewer_authority_reference','approval_reference_id','follow_up_status'] loop
      if key = 'reviewer_authority_reference' then
        if coalesce(item->>key,'') = '' or item->>key <> btrim(item->>key) or item->>key !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
          rejections := rejections || private.catalog_rejection('submissions', record_id, key, 'unstable_identifier');
        end if;
      elsif not private.catalog_valid_bounded_text(item->>key, 256) then
        rejections := rejections || private.catalog_rejection('submissions', record_id, key, 'invalid_envelope_shape');
      end if;
    end loop;
    if jsonb_typeof(item->'storage_context') <> 'object' or jsonb_typeof(item->'visual_context') <> 'object' or jsonb_typeof(item->'evidence') <> 'array' then
      rejections := rejections || private.catalog_rejection('submissions', record_id, '', 'invalid_envelope_shape');
    end if;
    if item ? 'supersedes_submission_id' and item->'supersedes_submission_id' <> 'null' and
      (item->>'supersedes_submission_id' <> btrim(item->>'supersedes_submission_id') or item->>'supersedes_submission_id' !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$') then
      rejections := rejections || private.catalog_rejection('submissions', record_id, 'supersedes_submission_id', 'unstable_identifier');
    end if;
    if jsonb_typeof(item->'evidence') = 'array' then
      for nested in select value from jsonb_array_elements(item->'evidence') loop
        if jsonb_typeof(nested) <> 'object' then
          rejections := rejections || private.catalog_rejection('evidence', record_id, '', 'invalid_envelope_shape');
        else
          foreach key in array private.catalog_unknown_keys(nested, ARRAY['id','field_or_claim','evidence_reference','source_id']) loop
            rejections := rejections || private.catalog_rejection('evidence', coalesce(nested->>'id',record_id), key, 'invalid_envelope_shape');
          end loop;
          if coalesce(nested->>'id','') = '' or nested->>'id' <> btrim(nested->>'id') or nested->>'id' !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
            rejections := rejections || private.catalog_rejection('evidence', coalesce(nested->>'id',record_id), 'id', 'unstable_identifier');
          end if;
          if not private.catalog_valid_bounded_text(nested->>'field_or_claim', 256)
            or not private.catalog_valid_bounded_text(nested->>'evidence_reference', 512) then
            rejections := rejections || private.catalog_rejection('evidence', coalesce(nested->>'id',record_id), 'evidence_reference', 'invalid_envelope_shape');
          end if;
          if nested ? 'source_id' and nested->'source_id' <> 'null'
            and (nested->>'source_id' <> btrim(nested->>'source_id') or nested->>'source_id' !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$') then
            rejections := rejections || private.catalog_rejection('evidence', coalesce(nested->>'id',record_id), 'source_id', 'unstable_identifier');
          end if;
        end if;
      end loop;
    end if;
  end loop;
  return rejections;
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
stable
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
            convert_to(coalesce(
              case when array_key = 'review_cases' then items.item->>'case_id' else items.item->>'id' end,
              items.item #>> '{}', ''
            ), 'UTF8'),
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
stable
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
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.catalog_review_cases
    where catalog_review_cases.revision_id = p_revision_id
      and catalog_review_cases.classification = 'production_candidate'
  );
$$;

create or replace function private.reject_locked_candidate_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_locked boolean := false;
begin
  if tg_table_name = 'content_revisions' then
    is_locked := (tg_op in ('UPDATE', 'DELETE') and private.candidate_snapshot_locked(old.id))
      or (tg_op in ('INSERT', 'UPDATE') and private.candidate_snapshot_locked(new.id));
  elsif tg_table_name in ('revision_tags', 'storage_rules',
    'revision_catalog_metadata', 'revision_visual_requirements', 'revision_visuals') then
    is_locked := (tg_op in ('UPDATE', 'DELETE') and private.candidate_snapshot_locked(old.revision_id))
      or (tg_op in ('INSERT', 'UPDATE') and private.candidate_snapshot_locked(new.revision_id));
  elsif tg_table_name = 'sources' then
    is_locked := exists (
      select 1 from public.content_revisions revision
      where revision.source_id in (old.id, new.id)
        and private.candidate_snapshot_locked(revision.id)
    );
  elsif tg_table_name = 'tags' then
    is_locked := exists (
      select 1 from public.revision_tags revision_tag
      where revision_tag.tag_id in (old.id, new.id)
        and private.candidate_snapshot_locked(revision_tag.revision_id)
    );
  elsif tg_table_name = 'preparations' then
    is_locked := exists (
      select 1 from public.content_revisions revision
      where revision.preparation_id in (old.id, new.id)
        and private.candidate_snapshot_locked(revision.id)
    );
  elsif tg_table_name = 'foods' then
    is_locked := exists (
      select 1
      from public.preparations preparation
      join public.content_revisions revision on revision.preparation_id = preparation.id
      where preparation.food_id in (old.id, new.id)
        and private.candidate_snapshot_locked(revision.id)
    );
  elsif tg_table_name = 'catalog_visuals' then
    is_locked := exists (
      select 1
      from public.revision_visuals revision_visual
      where revision_visual.visual_id in (old.id, new.id)
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

create or replace function private.catalog_rejection(
  p_collection text,
  p_record_id text,
  p_field_path text,
  p_code text,
  p_detail text default null
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'collection', p_collection,
    'record_id', coalesce(p_record_id, ''),
    'field_path', coalesce(p_field_path, ''),
    'code', p_code,
    'detail', p_detail
  ));
$$;

create or replace function private.catalog_rejection_result(p_rejections jsonb[])
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'accepted', false,
    'rejections', coalesce(
      (
        select jsonb_agg(item order by
          item->>'collection', item->>'record_id', item->>'field_path', item->>'code'
        )
        from unnest(coalesce(p_rejections, ARRAY[]::jsonb[])) as rejected(item)
      ),
      '[]'::jsonb
    )
  );
$$;

create or replace function private.catalog_unknown_keys(p_value jsonb, p_allowed text[])
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(key order by key), ARRAY[]::text[])
  from jsonb_object_keys(p_value) as keys(key)
  where not (key = any(p_allowed));
$$;

create or replace function private.catalog_valid_bounded_text(p_value text, p_max integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_value is not null
    and length(p_value) between 1 and p_max
    and p_value = btrim(p_value)
    and p_value !~ '[[:cntrl:]]'
    and p_value !~ '@'
    and p_value !~* '(^|[?&])(email|user|username)=';
$$;

create or replace function private.catalog_candidate_rejections(p_envelope jsonb)
returns jsonb[]
language plpgsql
stable
set search_path = ''
as $$
declare
  rejections jsonb[] := ARRAY[]::jsonb[];
  item jsonb;
  nested jsonb;
  key text;
  record_id text;
  required_key text;
begin
  if p_envelope is null or jsonb_typeof(p_envelope) <> 'object' then
    return array[private.catalog_rejection('package', '', '', 'invalid_envelope_shape')];
  end if;

  foreach key in array private.catalog_unknown_keys(p_envelope, ARRAY[
    'schema_version','package_id','package_version','package_created_at',
    'classification','payload_digest','review_cases','payload'
  ]) loop
    rejections := rejections || private.catalog_rejection(
      'package', '', key,
      case when key in ('owner_adjudications','publication_status','approved_at','review_decisions','catalog_mutations','retirements')
        then 'approved_candidate_forbidden' else 'invalid_envelope_shape' end
    );
  end loop;
  foreach required_key in array ARRAY['schema_version','package_id','package_version','package_created_at','classification','payload_digest','review_cases','payload'] loop
    if not (p_envelope ? required_key) then
      rejections := rejections || private.catalog_rejection('package', '', required_key, 'package_identity_missing');
    end if;
  end loop;

  if p_envelope->>'schema_version' is not null and p_envelope->>'schema_version' <> 'candidate-package/v1' then
    rejections := rejections || private.catalog_rejection('package', '', 'schema_version', 'unsupported_schema_version');
  end if;
  if p_envelope->>'classification' is not null and p_envelope->>'classification' <> 'production_candidate' then
    rejections := rejections || private.catalog_rejection('package', '', 'classification', 'invalid_classification');
  end if;
  if p_envelope->>'package_id' is null or p_envelope->>'package_version' is null
    or nullif(p_envelope->>'package_id','') is null or nullif(p_envelope->>'package_version','') is null then
    rejections := rejections || private.catalog_rejection('package', '', 'package_id', 'package_identity_missing');
  else
    if p_envelope->>'package_id' <> btrim(p_envelope->>'package_id')
      or p_envelope->>'package_version' <> btrim(p_envelope->>'package_version')
      or p_envelope->>'package_id' !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      or p_envelope->>'package_version' !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
      rejections := rejections || private.catalog_rejection('package', p_envelope->>'package_id', 'package_id', 'unstable_identifier');
    end if;
  end if;
  if p_envelope->>'package_created_at' is not null
    and p_envelope->>'package_created_at' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$' then
    rejections := rejections || private.catalog_rejection('package', '', 'package_created_at', 'invalid_envelope_shape');
  end if;
  if p_envelope->>'payload_digest' is not null and p_envelope->>'payload_digest' !~ '^sha256:[0-9a-f]{64}$' then
    rejections := rejections || private.catalog_rejection('package', '', 'payload_digest', 'invalid_envelope_shape');
  elsif p_envelope->>'payload_digest' is not null and private.catalog_import_digest(p_envelope) <> p_envelope->>'payload_digest' then
    rejections := rejections || private.catalog_rejection('package', '', 'payload_digest', 'package_digest_conflict');
  end if;

  if jsonb_typeof(p_envelope->'payload') <> 'object' then
    rejections := rejections || private.catalog_rejection('payload', '', '', 'invalid_envelope_shape');
  else
    foreach key in array private.catalog_unknown_keys(p_envelope->'payload', ARRAY['sources','tags','foods','preparations','revisions','visuals']) loop
      rejections := rejections || private.catalog_rejection('payload', '', key, 'invalid_envelope_shape');
    end loop;
    foreach required_key in array ARRAY['sources','tags','foods','preparations','revisions','visuals'] loop
      if jsonb_typeof(p_envelope->'payload'->required_key) <> 'array' then
        rejections := rejections || private.catalog_rejection('payload', '', required_key, 'invalid_envelope_shape');
      end if;
    end loop;
  end if;

  if jsonb_typeof(p_envelope->'review_cases') = 'array' then
    for item in select value from jsonb_array_elements(p_envelope->'review_cases') loop
      record_id := coalesce(item->>'case_id','');
      if jsonb_typeof(item) <> 'object' then
        rejections := rejections || private.catalog_rejection('review_cases', record_id, '', 'invalid_envelope_shape');
      else
        foreach key in array private.catalog_unknown_keys(item, ARRAY['case_id','revision_id']) loop
          rejections := rejections || private.catalog_rejection('review_cases', record_id, key, 'invalid_envelope_shape');
        end loop;
        if record_id = '' or record_id <> btrim(record_id) or record_id !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
          rejections := rejections || private.catalog_rejection('review_cases', record_id, 'case_id', 'unstable_identifier');
        end if;
        if coalesce(item->>'revision_id','') = '' or item->>'revision_id' <> btrim(item->>'revision_id')
          or item->>'revision_id' !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
          rejections := rejections || private.catalog_rejection('review_cases', record_id, 'revision_id', 'unstable_identifier');
        end if;
      end if;
    end loop;
  end if;

  if jsonb_typeof(p_envelope->'payload') = 'object' then
    if jsonb_typeof(p_envelope->'payload'->'sources') = 'array' and exists (
      select 1 from jsonb_array_elements(p_envelope->'payload'->'sources') value
      group by value->>'id' having count(*) > 1
    ) then
      rejections := rejections || private.catalog_rejection('sources', '', 'id', 'unstable_identifier');
    end if;
    if jsonb_typeof(p_envelope->'payload'->'tags') = 'array' and exists (
      select 1 from jsonb_array_elements(p_envelope->'payload'->'tags') value
      group by value->>'id' having count(*) > 1
    ) then
      rejections := rejections || private.catalog_rejection('tags', '', 'id', 'unstable_identifier');
    end if;
    if jsonb_typeof(p_envelope->'payload'->'foods') = 'array' and exists (
      select 1 from jsonb_array_elements(p_envelope->'payload'->'foods') value
      group by value->>'id' having count(*) > 1
    ) then
      rejections := rejections || private.catalog_rejection('foods', '', 'id', 'unstable_identifier');
    end if;
    if jsonb_typeof(p_envelope->'payload'->'preparations') = 'array' and exists (
      select 1 from jsonb_array_elements(p_envelope->'payload'->'preparations') value
      group by value->>'id' having count(*) > 1
    ) then
      rejections := rejections || private.catalog_rejection('preparations', '', 'id', 'unstable_identifier');
    end if;
    if jsonb_typeof(p_envelope->'payload'->'revisions') = 'array' and exists (
      select 1 from jsonb_array_elements(p_envelope->'payload'->'revisions') value
      group by value->>'id' having count(*) > 1
    ) then
      rejections := rejections || private.catalog_rejection('revisions', '', 'id', 'unstable_identifier');
    end if;
    if jsonb_typeof(p_envelope->'payload'->'visuals') = 'array' and exists (
      select 1 from jsonb_array_elements(p_envelope->'payload'->'visuals') value
      group by value->>'id' having count(*) > 1
    ) then
      rejections := rejections || private.catalog_rejection('visuals', '', 'id', 'unstable_identifier');
    end if;
    for item in select value from jsonb_array_elements(coalesce(p_envelope->'payload'->'sources','[]'::jsonb)) loop
      record_id := coalesce(item->>'id','');
      if jsonb_typeof(item) <> 'object' then
        rejections := rejections || private.catalog_rejection('sources', record_id, '', 'invalid_envelope_shape');
      else
        foreach key in array private.catalog_unknown_keys(item, ARRAY['id','publisher','title','url','source_date','accessed_at']) loop
          rejections := rejections || private.catalog_rejection('sources', record_id, key, 'invalid_envelope_shape');
        end loop;
        if record_id = '' or record_id <> btrim(record_id) or record_id !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
          rejections := rejections || private.catalog_rejection('sources', record_id, 'id', 'unstable_identifier');
        end if;
        foreach key in array ARRAY['publisher','title','url','source_date','accessed_at'] loop
          if jsonb_typeof(item->key) <> 'string' then
            rejections := rejections || private.catalog_rejection('sources', record_id, key, 'invalid_envelope_shape');
          end if;
        end loop;
        if coalesce(item->>'source_date','') !~ '^\d{4}-\d{2}-\d{2}$'
          or coalesce(item->>'accessed_at','') !~ '^\d{4}-\d{2}-\d{2}$' then
          rejections := rejections || private.catalog_rejection('sources', record_id, 'source_date', 'invalid_envelope_shape');
        end if;
      end if;
    end loop;
    for item in select value from jsonb_array_elements(coalesce(p_envelope->'payload'->'tags','[]'::jsonb)) loop
      record_id := coalesce(item->>'id','');
      if jsonb_typeof(item) <> 'object' then
        rejections := rejections || private.catalog_rejection('tags', record_id, '', 'invalid_envelope_shape');
      else
        foreach key in array private.catalog_unknown_keys(item, ARRAY['id','kind','label']) loop
          rejections := rejections || private.catalog_rejection('tags', record_id, key, 'invalid_envelope_shape');
        end loop;
        if record_id = '' or record_id <> btrim(record_id) or record_id !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
          rejections := rejections || private.catalog_rejection('tags', record_id, 'id', 'unstable_identifier');
        end if;
      end if;
    end loop;
    for item in select value from jsonb_array_elements(coalesce(p_envelope->'payload'->'foods','[]'::jsonb)) loop
      record_id := coalesce(item->>'id','');
      if jsonb_typeof(item) <> 'object' then
        rejections := rejections || private.catalog_rejection('foods', record_id, '', 'invalid_envelope_shape');
      else
        foreach key in array private.catalog_unknown_keys(item, ARRAY['id','slug','name','category']) loop
          rejections := rejections || private.catalog_rejection('foods', record_id, key, 'invalid_envelope_shape');
        end loop;
        if record_id = '' or record_id <> btrim(record_id) or record_id !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
          rejections := rejections || private.catalog_rejection('foods', record_id, 'id', 'unstable_identifier');
        end if;
      end if;
    end loop;
    for item in select value from jsonb_array_elements(coalesce(p_envelope->'payload'->'preparations','[]'::jsonb)) loop
      record_id := coalesce(item->>'id','');
      if jsonb_typeof(item) <> 'object' then
        rejections := rejections || private.catalog_rejection('preparations', record_id, '', 'invalid_envelope_shape');
      else
        foreach key in array private.catalog_unknown_keys(item, ARRAY['id','food_id','slug','name','is_active']) loop
          rejections := rejections || private.catalog_rejection('preparations', record_id, key, 'invalid_envelope_shape');
        end loop;
        if record_id = '' or record_id <> btrim(record_id) or record_id !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
          rejections := rejections || private.catalog_rejection('preparations', record_id, 'id', 'unstable_identifier');
        end if;
        if coalesce(item->>'food_id','') = '' or item->>'food_id' <> btrim(item->>'food_id')
          or item->>'food_id' !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
          rejections := rejections || private.catalog_rejection('preparations', record_id, 'food_id', 'unstable_identifier');
        end if;
        if jsonb_typeof(item->'is_active') <> 'boolean' then
          rejections := rejections || private.catalog_rejection('preparations', record_id, 'is_active', 'invalid_envelope_shape');
        end if;
      end if;
    end loop;
    for item in select value from jsonb_array_elements(coalesce(p_envelope->'payload'->'revisions','[]'::jsonb)) loop
      record_id := coalesce(item->>'id','');
      if jsonb_typeof(item) <> 'object' then
        rejections := rejections || private.catalog_rejection('revisions', record_id, '', 'invalid_envelope_shape');
      else
        foreach key in array private.catalog_unknown_keys(item, ARRAY['id','preparation_id','version','status','reviewer_role','reviewed_at','approved_at','next_review_at','method','shape_texture','source_id','tag_ids','visual_required','visual_ids','preparation_time_band','storage_rules']) loop
          rejections := rejections || private.catalog_rejection('revisions', record_id, key, 'invalid_envelope_shape');
        end loop;
        if record_id = '' or record_id <> btrim(record_id) or record_id !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
          rejections := rejections || private.catalog_rejection('revisions', record_id, 'id', 'unstable_identifier');
        end if;
        foreach key in array ARRAY['preparation_id','source_id'] loop
          if coalesce(item->>key,'') = '' or item->>key <> btrim(item->>key) or item->>key !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
            rejections := rejections || private.catalog_rejection('revisions', record_id, key, 'unstable_identifier');
          end if;
        end loop;
        if jsonb_typeof(item->'tag_ids') <> 'array' or jsonb_typeof(item->'visual_ids') <> 'array' or jsonb_typeof(item->'storage_rules') <> 'array' then
          rejections := rejections || private.catalog_rejection('revisions', record_id, '', 'invalid_envelope_shape');
        end if;
        if jsonb_typeof(item->'version') <> 'number' or item->>'version' !~ '^[1-9][0-9]*$'
          or jsonb_typeof(item->'visual_required') <> 'boolean' then
          rejections := rejections || private.catalog_rejection('revisions', record_id, 'version', 'invalid_envelope_shape');
        end if;
        foreach key in array ARRAY['tag_ids','visual_ids'] loop
          if jsonb_typeof(item->key) = 'array' then
            for nested in select value from jsonb_array_elements(item->key) loop
              if jsonb_typeof(nested) <> 'string' or nested #>> '{}' <> btrim(nested #>> '{}') or nested #>> '{}' !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
                rejections := rejections || private.catalog_rejection('revisions', record_id, key, 'unstable_identifier');
              end if;
            end loop;
          end if;
        end loop;
        if jsonb_typeof(item->'storage_rules') = 'array' then
          for nested in select value from jsonb_array_elements(item->'storage_rules') loop
            if jsonb_typeof(nested) <> 'object' then
              rejections := rejections || private.catalog_rejection('storage_rules', record_id, '', 'invalid_envelope_shape');
            else
              foreach key in array private.catalog_unknown_keys(nested, ARRAY['id','support_status','deadline_kind','duration_hours','guidance']) loop
                rejections := rejections || private.catalog_rejection('storage_rules', coalesce(nested->>'id',record_id), key, 'invalid_envelope_shape');
              end loop;
              if coalesce(nested->>'id','') = '' or nested->>'id' <> btrim(nested->>'id') or nested->>'id' !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
                rejections := rejections || private.catalog_rejection('storage_rules', coalesce(nested->>'id',record_id), 'id', 'unstable_identifier');
              end if;
              if nested ? 'duration_hours' and nested->'duration_hours' <> 'null'
                and (jsonb_typeof(nested->'duration_hours') <> 'number' or nested->>'duration_hours' !~ '^[1-9][0-9]*$') then
                rejections := rejections || private.catalog_rejection('storage_rules', coalesce(nested->>'id',record_id), 'duration_hours', 'invalid_envelope_shape');
              end if;
            end if;
          end loop;
        end if;
      end if;
    end loop;
    for item in select value from jsonb_array_elements(coalesce(p_envelope->'payload'->'visuals','[]'::jsonb)) loop
      record_id := coalesce(item->>'id','');
      if jsonb_typeof(item) <> 'object' then
        rejections := rejections || private.catalog_rejection('visuals', record_id, '', 'invalid_envelope_shape');
      else
        foreach key in array private.catalog_unknown_keys(item, ARRAY['id','asset_reference','rights_basis','rights_holder','license_name','license_url','alt_text','reviewed_at']) loop
          rejections := rejections || private.catalog_rejection('visuals', record_id, key, 'invalid_envelope_shape');
        end loop;
        if record_id = '' or record_id <> btrim(record_id) or record_id !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
          rejections := rejections || private.catalog_rejection('visuals', record_id, 'id', 'unstable_identifier');
        end if;
        if coalesce(item->>'reviewed_at','') !~ '^\d{4}-\d{2}-\d{2}$' then
          rejections := rejections || private.catalog_rejection('visuals', record_id, 'reviewed_at', 'invalid_envelope_shape');
        end if;
      end if;
    end loop;
  end if;
  return rejections;
end;
$$;

revoke all on function private.catalog_rejection(text,text,text,text,text)
  from public, anon, authenticated, service_role;
revoke all on function private.catalog_rejection_result(jsonb[])
  from public, anon, authenticated, service_role;
revoke all on function private.catalog_unknown_keys(jsonb,text[])
  from public, anon, authenticated, service_role;
revoke all on function private.catalog_valid_bounded_text(text,integer)
  from public, anon, authenticated, service_role;
revoke all on function private.catalog_candidate_rejections(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.catalog_review_rejections(jsonb)
  from public, anon, authenticated, service_role;

create or replace function private.catalog_try_date(p_value text)
returns date
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_value is null or p_value !~ '^\d{4}-\d{2}-\d{2}$' then
    return null;
  end if;
  return make_date(
    substring(p_value, 1, 4)::integer,
    substring(p_value, 6, 2)::integer,
    substring(p_value, 9, 2)::integer
  );
exception when others then
  return null;
end;
$$;

create or replace function private.catalog_try_timestamptz(p_value text)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_value is null
    or p_value !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$' then
    return null;
  end if;
  return p_value::timestamptz;
exception when others then
  return null;
end;
$$;

create or replace function private.catalog_valid_context_text(p_value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_value) = 'string'
    and private.catalog_valid_bounded_text(p_value #>> '{}', 1024);
$$;

create or replace function private.catalog_context_rejections(
  p_value jsonb,
  p_collection text,
  p_record_id text,
  p_field_path text,
  p_allowed text[]
)
returns jsonb[]
language plpgsql
stable
set search_path = ''
as $$
declare
  rejections jsonb[] := ARRAY[]::jsonb[];
  key text;
begin
  if jsonb_typeof(p_value) <> 'object' then
    return array[private.catalog_rejection(p_collection, p_record_id, p_field_path, 'invalid_envelope_shape')];
  end if;
  foreach key in array private.catalog_unknown_keys(p_value, p_allowed) loop
    rejections := rejections || private.catalog_rejection(
      p_collection, p_record_id, p_field_path || '.' || key, 'invalid_envelope_shape'
    );
  end loop;
  foreach key in array p_allowed loop
    if p_value ? key and not private.catalog_valid_context_text(p_value->key) then
      rejections := rejections || private.catalog_rejection(
        p_collection, p_record_id, p_field_path || '.' || key, 'invalid_envelope_shape'
      );
    end if;
  end loop;
  return rejections;
end;
$$;

alter function private.catalog_review_rejections(jsonb)
  rename to catalog_review_rejections_shape;

create or replace function private.catalog_review_rejections(p_envelope jsonb)
returns jsonb[]
language plpgsql
stable
set search_path = ''
as $$
declare
  rejections jsonb[] := private.catalog_review_rejections_shape(p_envelope);
  item jsonb;
  record_id text;
begin
  if jsonb_typeof(p_envelope->'submissions') = 'array' then
    for item in select value from jsonb_array_elements(p_envelope->'submissions') loop
      if jsonb_typeof(item) = 'object' then
        record_id := coalesce(item->>'id', '');
        rejections := rejections || private.catalog_context_rejections(
          item->'storage_context', 'submissions', record_id, 'storage_context',
          ARRAY['existing_storage_guidance','refrigeration_freezing','duration_claim','reheating_serving_implication']
        );
        rejections := rejections || private.catalog_context_rejections(
          item->'visual_context', 'submissions', record_id, 'visual_context',
          ARRAY['visual_reference','rights_license_evidence','alt_text']
        );
      end if;
    end loop;
  end if;
  return rejections;
end;
$$;

create or replace function private.catalog_candidate_semantic_rejections(p_envelope jsonb)
returns jsonb[]
language plpgsql
stable
set search_path = ''
as $$
declare
  rejections jsonb[] := ARRAY[]::jsonb[];
  payload jsonb := p_envelope->'payload';
  item jsonb;
  nested jsonb;
  record_id text;
  key text;
  existing_case public.catalog_review_cases%rowtype;
begin
  if jsonb_typeof(p_envelope) <> 'object' then
    return rejections;
  end if;
  if jsonb_typeof(p_envelope->'payload') <> 'object' then
    return rejections;
  end if;
  if private.catalog_try_timestamptz(p_envelope->>'package_created_at') is null then
    rejections := rejections || private.catalog_rejection('package', '', 'package_created_at', 'invalid_envelope_shape');
  end if;

  if p_envelope->>'payload_digest' ~ '^sha256:[0-9a-f]{64}$' then
    begin
      perform private.catalog_import_digest(p_envelope);
    exception when others then
      rejections := rejections || private.catalog_rejection('package', '', 'payload_digest', 'invalid_envelope_shape');
    end;
  end if;

  for item in select value from jsonb_array_elements(coalesce(payload->'sources', '[]'::jsonb)) loop
    record_id := coalesce(item->>'id', '');
    if jsonb_typeof(item) = 'object' then
      foreach key in array ARRAY['publisher','title','url'] loop
        if not private.catalog_valid_bounded_text(item->>key, 1024) then
          rejections := rejections || private.catalog_rejection('sources', record_id, key, 'invalid_envelope_shape');
        end if;
      end loop;
      if coalesce(item->>'url','') !~ '^https://[^[:space:]]+$'
        or private.catalog_try_date(item->>'source_date') is null
        or private.catalog_try_date(item->>'accessed_at') is null then
        rejections := rejections || private.catalog_rejection('sources', record_id, 'source_date', 'invalid_envelope_shape');
      end if;
      if exists (
        select 1 from public.sources existing
        where existing.id = record_id
          and (existing.publisher <> item->>'publisher' or existing.title <> item->>'title'
            or existing.url <> item->>'url'
            or existing.source_date <> private.catalog_try_date(item->>'source_date')
            or existing.accessed_at <> private.catalog_try_date(item->>'accessed_at'))
      ) then
        rejections := rejections || private.catalog_rejection('sources', record_id, 'id', 'record_identity_conflict');
      end if;
    end if;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(payload->'tags', '[]'::jsonb)) loop
    record_id := coalesce(item->>'id', '');
    if item->>'kind' not in ('skill','allergen','category')
      or not private.catalog_valid_bounded_text(item->>'label', 256) then
      rejections := rejections || private.catalog_rejection('tags', record_id, 'kind', 'invalid_envelope_shape');
    end if;
    if exists (select 1 from public.tags existing where existing.id = record_id
      and (existing.kind <> item->>'kind' or existing.label <> item->>'label')) then
      rejections := rejections || private.catalog_rejection('tags', record_id, 'id', 'record_identity_conflict');
    end if;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(payload->'foods', '[]'::jsonb)) loop
    record_id := coalesce(item->>'id', '');
    if item->>'slug' !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      or not private.catalog_valid_bounded_text(item->>'name', 256)
      or not private.catalog_valid_bounded_text(item->>'category', 128) then
      rejections := rejections || private.catalog_rejection('foods', record_id, 'slug', 'invalid_envelope_shape');
    end if;
    if exists (select 1 from public.foods existing where existing.id = record_id
      and (existing.slug <> item->>'slug' or existing.name <> item->>'name' or existing.category <> item->>'category')) then
      rejections := rejections || private.catalog_rejection('foods', record_id, 'id', 'record_identity_conflict');
    end if;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(payload->'preparations', '[]'::jsonb)) loop
    record_id := coalesce(item->>'id', '');
    if item->>'slug' !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      or item->>'food_id' !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      or not private.catalog_valid_bounded_text(item->>'name', 256)
      or jsonb_typeof(item->'is_active') <> 'boolean' then
      rejections := rejections || private.catalog_rejection('preparations', record_id, 'slug', 'invalid_envelope_shape');
    end if;
    if not exists (select 1 from public.foods where id = item->>'food_id')
      and not exists (select 1 from jsonb_array_elements(coalesce(payload->'foods','[]'::jsonb)) food where food->>'id' = item->>'food_id') then
      rejections := rejections || private.catalog_rejection('preparations', record_id, 'food_id', 'unknown_source');
    end if;
    if exists (select 1 from public.preparations existing where existing.id = record_id
      and jsonb_typeof(item->'is_active') = 'boolean'
      and (existing.food_id <> item->>'food_id' or existing.slug <> item->>'slug'
        or existing.name <> item->>'name' or existing.is_active <> (item->>'is_active')::boolean)) then
      rejections := rejections || private.catalog_rejection('preparations', record_id, 'id', 'record_identity_conflict');
    end if;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(payload->'revisions', '[]'::jsonb)) loop
    record_id := coalesce(item->>'id', '');
    if (item->>'version' !~ '^[1-9][0-9]*$')
      or item->>'preparation_id' !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      or item->>'source_id' !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      or coalesce(item->>'status', 'draft') <> 'draft'
      or not private.catalog_valid_bounded_text(item->>'method', 2048)
      or not private.catalog_valid_bounded_text(item->>'shape_texture', 1024)
      or item->>'preparation_time_band' not in ('under_15_minutes','15_to_30_minutes','over_30_minutes') then
      rejections := rejections || private.catalog_rejection('revisions', record_id, 'id', 'invalid_envelope_shape');
    end if;
    if not exists (select 1 from public.preparations where id = item->>'preparation_id')
      and not exists (select 1 from jsonb_array_elements(coalesce(payload->'preparations','[]'::jsonb)) prep where prep->>'id' = item->>'preparation_id') then
      rejections := rejections || private.catalog_rejection('revisions', record_id, 'preparation_id', 'unknown_source');
    end if;
    if not exists (select 1 from public.sources where id = item->>'source_id')
      and not exists (select 1 from jsonb_array_elements(coalesce(payload->'sources','[]'::jsonb)) source where source->>'id' = item->>'source_id') then
      rejections := rejections || private.catalog_rejection('revisions', record_id, 'source_id', 'unknown_source');
    end if;
    if jsonb_typeof(item->'visual_required') <> 'boolean'
      or (jsonb_typeof(item->'visual_required') = 'boolean'
        and (item->>'visual_required')::boolean
        and jsonb_array_length(coalesce(item->'visual_ids','[]'::jsonb)) = 0) then
      rejections := rejections || private.catalog_rejection('revisions', record_id, 'visual_ids', 'invalid_visual_contract');
    end if;
    foreach key in array ARRAY['tag_ids','visual_ids'] loop
      if jsonb_typeof(item->key) = 'array' then
        for nested in select value from jsonb_array_elements(item->key) loop
          if jsonb_typeof(nested) <> 'string' or nested #>> '{}' !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
            rejections := rejections || private.catalog_rejection('revisions', record_id, key, 'unstable_identifier');
          elsif key = 'tag_ids'
            and not exists (select 1 from public.tags tag where tag.id = nested #>> '{}')
            and not exists (select 1 from jsonb_array_elements(coalesce(payload->'tags','[]'::jsonb)) tag_value where tag_value->>'id' = nested #>> '{}') then
            rejections := rejections || private.catalog_rejection('revisions', record_id, key, 'unknown_tag');
          elsif key = 'visual_ids'
            and not exists (select 1 from public.catalog_visuals visual where visual.id = nested #>> '{}')
            and not exists (select 1 from jsonb_array_elements(coalesce(payload->'visuals','[]'::jsonb)) visual_value where visual_value->>'id' = nested #>> '{}') then
            rejections := rejections || private.catalog_rejection('revisions', record_id, key, 'invalid_visual_contract');
          end if;
        end loop;
      end if;
    end loop;
    for nested in select value from jsonb_array_elements(coalesce(item->'storage_rules','[]'::jsonb)) loop
      if nested->>'support_status' not in ('supported','unsupported')
        or nested->>'deadline_kind' not in ('discard_after','quality_by','informational') and nested->'deadline_kind' <> 'null'
        or (nested->>'support_status' = 'unsupported' and (nested->'deadline_kind' <> 'null' or nested->'duration_hours' <> 'null' or nested->'guidance' <> 'null'))
        or (nested->>'support_status' = 'supported' and (nested->'deadline_kind' = 'null' or not private.catalog_valid_bounded_text(nested->>'guidance', 2048)
          or (nested->>'deadline_kind' <> 'informational' and nested->>'duration_hours' !~ '^[1-9][0-9]*$')
          or (nested->>'deadline_kind' = 'informational' and nested->'duration_hours' <> 'null'))) then
        rejections := rejections || private.catalog_rejection('storage_rules', coalesce(nested->>'id', record_id), 'support_status', 'invalid_storage_contract');
      end if;
    end loop;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(payload->'visuals', '[]'::jsonb)) loop
    record_id := coalesce(item->>'id', '');
    if coalesce(item->>'asset_reference','') !~ '^/[A-Za-z0-9]'
      or item->>'rights_basis' not in ('original','licensed')
      or not private.catalog_valid_bounded_text(item->>'rights_holder', 256)
      or length(btrim(coalesce(item->>'alt_text',''))) < 12
      or private.catalog_try_date(item->>'reviewed_at') is null
      or (item->>'rights_basis' = 'original' and (nullif(btrim(item->>'license_name'),'') is not null or nullif(btrim(item->>'license_url'),'') is not null))
      or (item->>'rights_basis' = 'licensed' and (not private.catalog_valid_bounded_text(item->>'license_name', 256)
        or coalesce(item->>'license_url','') !~ '^https://[^[:space:]]+$')) then
      rejections := rejections || private.catalog_rejection('visuals', record_id, 'id', 'invalid_visual_contract');
    end if;
  end loop;

  if exists (select 1 from jsonb_array_elements(coalesce(payload->'revisions','[]'::jsonb)) revision
    where jsonb_typeof(revision->'visual_required') = 'boolean'
      and (revision->>'visual_required')::boolean
      and not exists (select 1 from jsonb_array_elements_text(coalesce(revision->'visual_ids','[]'::jsonb)) visual_id
        where exists (select 1 from public.catalog_visuals visual where visual.id = visual_id)
          or exists (select 1 from jsonb_array_elements(coalesce(payload->'visuals','[]'::jsonb)) visual where visual->>'id' = visual_id))) then
    rejections := rejections || private.catalog_rejection('revisions', '', 'visual_ids', 'invalid_visual_contract');
  end if;

  if (select count(*) from jsonb_array_elements(coalesce(p_envelope->'review_cases','[]'::jsonb)))
      <> (select count(*) from jsonb_array_elements(coalesce(payload->'revisions','[]'::jsonb))) then
    rejections := rejections || private.catalog_rejection('review_cases', '', 'revision_id', 'candidate_revision_mismatch');
  end if;
  for item in select value from jsonb_array_elements(coalesce(p_envelope->'review_cases','[]'::jsonb)) loop
    if not exists (select 1 from jsonb_array_elements(coalesce(payload->'revisions','[]'::jsonb)) revision where revision->>'id' = item->>'revision_id') then
      rejections := rejections || private.catalog_rejection('review_cases', item->>'case_id', 'revision_id', 'candidate_revision_mismatch');
    end if;
    select * into existing_case from public.catalog_review_cases where id = item->>'case_id';
    if existing_case.id is not null and (existing_case.revision_id <> item->>'revision_id' or existing_case.classification <> 'production_candidate') then
      rejections := rejections || private.catalog_rejection('review_cases', item->>'case_id', 'revision_id', 'candidate_revision_mismatch');
    end if;
  end loop;
  return rejections;
end;
$$;

create or replace function private.catalog_review_semantic_rejections(p_envelope jsonb)
returns jsonb[]
language plpgsql
stable
set search_path = ''
as $$
declare
  rejections jsonb[] := ARRAY[]::jsonb[];
  item jsonb;
  nested jsonb;
  record_id text;
  dimension_text text;
  predecessor text;
  current_tip text;
  current_count integer;
  review_case public.catalog_review_cases%rowtype;
  revision_id text := p_envelope->>'revision_id';
  visual_applicable boolean;
begin
  if jsonb_typeof(p_envelope) <> 'object' then return rejections; end if;
  if private.catalog_try_timestamptz(p_envelope->>'package_created_at') is null then
    rejections := rejections || private.catalog_rejection('package', '', 'package_created_at', 'invalid_envelope_shape');
  end if;
  if exists (select 1 from public.catalog_import_receipts receipt
    where receipt.import_kind = 'qualified_review_packet'
      and receipt.package_id = p_envelope->>'package_id'
      and receipt.package_version = p_envelope->>'package_version'
      and receipt.payload_digest = p_envelope->>'payload_digest') then
    return rejections;
  end if;
  select * into review_case from public.catalog_review_cases where id = p_envelope->>'case_id';
  if review_case.id is null then
    rejections := rejections || private.catalog_rejection('package', '', 'case_id', 'review_case_missing');
    return rejections;
  end if;
  if review_case.revision_id <> revision_id or review_case.classification <> 'production_candidate' then
    rejections := rejections || private.catalog_rejection('package', '', 'revision_id', 'review_revision_mismatch');
  end if;
  if review_case.status::text = 'completed' then
    rejections := rejections || private.catalog_rejection('package', '', 'case_id', 'review_case_completed');
    return rejections;
  end if;
  select exists (select 1 from public.revision_visual_requirements requirement where requirement.revision_id = review_case.revision_id and requirement.visual_required)
    or exists (select 1 from public.revision_visuals associated_visual where associated_visual.revision_id = review_case.revision_id)
    into visual_applicable;

  for item in select value from jsonb_array_elements(coalesce(p_envelope->'submissions','[]'::jsonb)) loop
    record_id := coalesce(item->>'id','');
    dimension_text := item->>'dimension';
    predecessor := nullif(btrim(item->>'supersedes_submission_id'), '');
    if private.catalog_try_date(item->>'reviewed_at') is null then
      rejections := rejections || private.catalog_rejection('submissions', record_id, 'reviewed_at', 'invalid_envelope_shape');
    end if;
    if dimension_text not in ('feeding_safety_developmental','allergy_restriction','nutrition_age_stage','taxonomy_labeling','storage_handling','visual_accessibility_rights') then
      rejections := rejections || private.catalog_rejection('submissions', record_id, 'dimension', 'invalid_envelope_shape');
    end if;
    if item->>'decision' not in ('Accept','Accept with clarification','Revise','Block','Not applicable','Insufficient evidence') then
      rejections := rejections || private.catalog_rejection('submissions', record_id, 'decision', 'invalid_envelope_shape');
    end if;
    if item->>'follow_up_status' not in ('none','resolved','required','unresolved') then
      rejections := rejections || private.catalog_rejection('submissions', record_id, 'follow_up_status', 'invalid_envelope_shape');
    end if;
    if dimension_text = 'storage_handling' and item->>'storage_support_state' not in ('supported','unsupported','unknown') then
      rejections := rejections || private.catalog_rejection('submissions', record_id, 'storage_support_state', 'invalid_storage_contract');
    elsif dimension_text <> 'storage_handling' and item ? 'storage_support_state' and item->>'storage_support_state' is not null then
      rejections := rejections || private.catalog_rejection('submissions', record_id, 'storage_support_state', 'invalid_storage_contract');
    end if;
    if dimension_text = 'visual_accessibility_rights' and visual_applicable and not exists (select 1 from jsonb_each(item->'visual_context')) then
      rejections := rejections || private.catalog_rejection('submissions', record_id, 'visual_context', 'conditional_visual_review_missing');
    end if;
    if jsonb_array_length(coalesce(item->'evidence','[]'::jsonb)) = 0 then
      rejections := rejections || private.catalog_rejection('submissions', record_id, 'evidence', 'missing_review_evidence');
    end if;
    if not private.catalog_valid_bounded_text(item->>'reviewer_role', 256) then
      rejections := rejections || private.catalog_rejection('submissions', record_id, 'reviewer_role', 'invalid_envelope_shape');
    end if;
    if nullif(btrim(item->>'approval_reference_id'),'') is null then
      rejections := rejections || private.catalog_rejection('submissions', record_id, 'approval_reference_id', 'approval_reference_missing');
    end if;
    if not exists (select 1 from public.catalog_reviewer_authorities authority where authority.reference = item->>'reviewer_authority_reference') then
      rejections := rejections || private.catalog_rejection('submissions', record_id, 'reviewer_authority_reference', 'unknown_reviewer_authority');
    elsif not exists (select 1 from public.catalog_reviewer_authority_dimensions authority_dimension where authority_dimension.authority_reference = item->>'reviewer_authority_reference' and authority_dimension.dimension::text = dimension_text) then
      rejections := rejections || private.catalog_rejection('submissions', record_id, 'dimension', 'authority_dimension_mismatch');
    elsif not exists (select 1 from public.catalog_reviewer_authorities authority where authority.reference = item->>'reviewer_authority_reference'
      and (authority.valid_from is null or authority.valid_from <= private.catalog_try_date(item->>'reviewed_at'))
      and (authority.valid_until is null or authority.valid_until >= private.catalog_try_date(item->>'reviewed_at'))) then
      rejections := rejections || private.catalog_rejection('submissions', record_id, 'reviewed_at', 'authority_not_effective');
    end if;
    for nested in select value from jsonb_array_elements(coalesce(item->'evidence','[]'::jsonb)) loop
      if jsonb_typeof(nested) <> 'object' or nested->>'id' !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
        or not private.catalog_valid_bounded_text(nested->>'field_or_claim', 256)
        or not private.catalog_valid_bounded_text(nested->>'evidence_reference', 1024) then
        rejections := rejections || private.catalog_rejection('evidence', record_id, 'id', 'invalid_envelope_shape');
      elsif nested ? 'source_id' and nested->>'source_id' is not null
        and not exists (select 1 from public.sources where id = nested->>'source_id') then
        rejections := rejections || private.catalog_rejection('evidence', nested->>'id', 'source_id', 'unknown_source');
      end if;
    end loop;
    if predecessor is null then
      select count(*), min(current_submission.id) into current_count, current_tip
      from public.catalog_review_submissions current_submission
      where current_submission.case_id = review_case.id
        and current_submission.dimension::text = dimension_text
        and not exists (select 1 from public.catalog_review_submissions successor where successor.supersedes_submission_id = current_submission.id);
      if current_count > 0 then
        rejections := rejections || private.catalog_rejection('submissions', record_id, 'supersedes_submission_id', 'duplicate_effective_submission');
      end if;
    elsif not exists (select 1 from jsonb_array_elements(coalesce(p_envelope->'submissions','[]'::jsonb)) packet_item where packet_item->>'id' = predecessor) then
      select count(*), min(current_submission.id) into current_count, current_tip
      from public.catalog_review_submissions current_submission
      where current_submission.case_id = review_case.id
        and current_submission.dimension::text = dimension_text
        and not exists (select 1 from public.catalog_review_submissions successor where successor.supersedes_submission_id = current_submission.id);
      if current_count = 0 or (current_count = 1 and current_tip <> predecessor) then
        rejections := rejections || private.catalog_rejection('submissions', record_id, 'supersedes_submission_id', 'invalid_submission_supersession');
      elsif current_count > 1 then
        rejections := rejections || private.catalog_rejection('submissions', record_id, 'supersedes_submission_id', 'duplicate_effective_submission');
      end if;
    end if;
  end loop;
  return rejections;
end;
$$;

create or replace function private.catalog_exception_code(p_message text, p_sqlstate text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_message in (
      'package_digest_conflict','unsupported_schema_version','package_identity_missing',
      'invalid_classification','approved_candidate_forbidden','candidate_status_forbidden',
      'record_identity_conflict','unknown_source','unknown_tag','invalid_storage_contract',
      'invalid_visual_contract','candidate_revision_mismatch','candidate_snapshot_locked',
      'review_case_missing','review_revision_mismatch','unknown_reviewer_authority',
      'authority_dimension_mismatch','authority_not_effective','missing_review_evidence',
      'approval_reference_missing','invalid_submission_supersession','duplicate_effective_submission',
      'conditional_visual_review_missing','owner_adjudication_forbidden_in_packet',
      'review_case_completed','invalid_envelope_shape'
    ) then p_message
    when p_sqlstate in ('22P02','22007','22023') then 'invalid_envelope_shape'
    when p_sqlstate = '23505' then 'record_identity_conflict'
    when p_sqlstate = '23503' then 'unknown_source'
    when p_sqlstate = '23514' then 'invalid_envelope_shape'
    when p_sqlstate = '55000' then 'candidate_snapshot_locked'
    else null
  end;
$$;

create or replace function private.catalog_import_error_result(
  p_collection text,
  p_message text,
  p_sqlstate text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  code text := private.catalog_exception_code(p_message, p_sqlstate);
begin
  if code is null then
    raise exception 'catalog import failed' using errcode = 'XX000';
  end if;
  return private.catalog_rejection_result(array[
    private.catalog_rejection(p_collection, '', '', code)
  ]);
end;
$$;

alter function public.import_catalog_candidate_package(jsonb)
  rename to import_catalog_candidate_package_unchecked;
alter function public.import_catalog_review_packet(jsonb)
  rename to import_catalog_review_packet_unchecked;

create or replace function public.import_catalog_candidate_package(p_envelope jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  rejections jsonb[];
  message text;
  returned_state text;
begin
  rejections := private.catalog_candidate_rejections(p_envelope)
    || private.catalog_candidate_semantic_rejections(p_envelope);
  if cardinality(rejections) > 0 then
    return private.catalog_rejection_result(rejections);
  end if;
  begin
    return public.import_catalog_candidate_package_unchecked(p_envelope);
  exception when others then
    get stacked diagnostics message = message_text, returned_state = returned_sqlstate;
    return private.catalog_import_error_result('package', message, returned_state);
  end;
exception when others then
  get stacked diagnostics message = message_text, returned_state = returned_sqlstate;
  return private.catalog_import_error_result('package', message, returned_state);
end;
$$;

create or replace function public.import_catalog_review_packet(p_envelope jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  rejections jsonb[];
  message text;
  returned_state text;
begin
  rejections := private.catalog_review_rejections(p_envelope)
    || private.catalog_review_semantic_rejections(p_envelope);
  if cardinality(rejections) > 0 then
    return private.catalog_rejection_result(rejections);
  end if;
  begin
    return public.import_catalog_review_packet_unchecked(p_envelope);
  exception when others then
    get stacked diagnostics message = message_text, returned_state = returned_sqlstate;
    return private.catalog_import_error_result('submissions', message, returned_state);
  end;
exception when others then
  get stacked diagnostics message = message_text, returned_state = returned_sqlstate;
  return private.catalog_import_error_result('submissions', message, returned_state);
end;
$$;

revoke all on function public.import_catalog_candidate_package_unchecked(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.import_catalog_review_packet_unchecked(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.catalog_try_date(text)
  from public, anon, authenticated, service_role;
revoke all on function private.catalog_try_timestamptz(text)
  from public, anon, authenticated, service_role;
revoke all on function private.catalog_valid_context_text(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.catalog_context_rejections(jsonb,text,text,text,text[])
  from public, anon, authenticated, service_role;
revoke all on function private.catalog_candidate_semantic_rejections(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.catalog_review_semantic_rejections(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.catalog_exception_code(text,text)
  from public, anon, authenticated, service_role;
revoke all on function private.catalog_import_error_result(text,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.import_catalog_candidate_package(jsonb)
  from public, anon, authenticated;
revoke all on function public.import_catalog_review_packet(jsonb)
  from public, anon, authenticated;
grant execute on function public.import_catalog_candidate_package(jsonb)
  to service_role;
grant execute on function public.import_catalog_review_packet(jsonb)
  to service_role;

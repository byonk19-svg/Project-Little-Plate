create or replace function public.import_catalog_candidate_package(p_envelope jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  payload jsonb;
  source_record jsonb;
  tag_record jsonb;
  food_record jsonb;
  preparation_record jsonb;
  revision_record jsonb;
  rule_record jsonb;
  visual_record jsonb;
  mapping_record jsonb;
  existing_source public.sources%rowtype;
  existing_tag public.tags%rowtype;
  existing_food public.foods%rowtype;
  existing_preparation public.preparations%rowtype;
  existing_revision public.content_revisions%rowtype;
  existing_rule public.storage_rules%rowtype;
  existing_visual public.catalog_visuals%rowtype;
  existing_requirement public.revision_visual_requirements%rowtype;
  existing_metadata public.revision_catalog_metadata%rowtype;
  existing_case public.catalog_review_cases%rowtype;
  receipt public.catalog_import_receipts%rowtype;
  package_id text;
  package_version text;
  package_digest text;
  package_created_at timestamptz;
  revision_id text;
  case_id text;
  expected_tags jsonb;
  actual_tags jsonb;
  expected_visuals jsonb;
  actual_visuals jsonb;
  expected_rules jsonb;
  actual_rules jsonb;
  result jsonb;
  rejections jsonb[];
begin
  if p_envelope is not null and jsonb_typeof(p_envelope) = 'object'
    and p_envelope->>'payload_digest' is not null
    and p_envelope->>'payload_digest' ~ '^sha256:[0-9a-f]{64}$'
    and private.catalog_import_digest(p_envelope) <> p_envelope->>'payload_digest' then
    raise exception 'package_digest_conflict';
  end if;
  rejections := private.catalog_candidate_rejections(p_envelope);
  if cardinality(rejections) > 0 then
    return private.catalog_rejection_result(rejections);
  end if;

  if p_envelope->>'schema_version' <> 'candidate-package/v1' then
    raise exception 'unsupported_schema_version';
  end if;

  package_id := nullif(btrim(p_envelope->>'package_id'), '');
  package_version := nullif(btrim(p_envelope->>'package_version'), '');
  if package_id is null or package_version is null
    or p_envelope->>'package_created_at' is null then
    raise exception 'package_identity_missing';
  end if;

  if p_envelope->>'classification' <> 'production_candidate' then
    raise exception 'invalid_classification';
  end if;

  if p_envelope ? 'owner_adjudications'
    or p_envelope ? 'publication_status'
    or p_envelope ? 'approved_at'
    or p_envelope ? 'review_decisions'
    or p_envelope ? 'catalog_mutations'
    or p_envelope ? 'retirements'
    or p_envelope->'payload' ? 'retirements' then
    raise exception 'approved_candidate_forbidden';
  end if;

  payload := p_envelope->'payload';
  if payload is null or jsonb_typeof(payload) <> 'object'
    or jsonb_typeof(payload->'sources') <> 'array'
    or jsonb_typeof(payload->'tags') <> 'array'
    or jsonb_typeof(payload->'foods') <> 'array'
    or jsonb_typeof(payload->'preparations') <> 'array'
    or jsonb_typeof(payload->'revisions') <> 'array'
    or jsonb_typeof(payload->'visuals') <> 'array'
    or jsonb_typeof(p_envelope->'review_cases') <> 'array' then
    raise exception 'package_identity_missing';
  end if;

  package_digest := private.catalog_import_digest(p_envelope);
  if p_envelope->>'payload_digest' <> package_digest then
    raise exception 'package_digest_conflict';
  end if;
  package_created_at := (p_envelope->>'package_created_at')::timestamptz;

  if exists (
    select 1 from jsonb_array_elements(payload->'sources') item
    group by item->>'id' having count(*) > 1
  ) or exists (
    select 1 from jsonb_array_elements(payload->'tags') item
    group by item->>'id' having count(*) > 1
  ) or exists (
    select 1 from jsonb_array_elements(payload->'foods') item
    group by item->>'id' having count(*) > 1
  ) or exists (
    select 1 from jsonb_array_elements(payload->'preparations') item
    group by item->>'id' having count(*) > 1
  ) or exists (
    select 1 from jsonb_array_elements(payload->'revisions') item
    group by item->>'id' having count(*) > 1
  ) or exists (
    select 1 from jsonb_array_elements(payload->'visuals') item
    group by item->>'id' having count(*) > 1
  ) or exists (
    select 1 from jsonb_array_elements(p_envelope->'review_cases') item
    group by item->>'case_id' having count(*) > 1
  ) or exists (
    select 1 from jsonb_array_elements(p_envelope->'review_cases') item
    group by item->>'revision_id' having count(*) > 1
  ) or exists (
    select 1
    from jsonb_array_elements(payload->'revisions') revision,
      jsonb_array_elements(coalesce(revision->'storage_rules', '[]'::jsonb)) rule
    group by rule->>'id' having count(*) > 1
  ) or exists (
    select 1
    from jsonb_array_elements(payload->'revisions') revision,
      jsonb_array_elements_text(coalesce(revision->'tag_ids', '[]'::jsonb)) tag_id
    group by revision->>'id', tag_id having count(*) > 1
  ) or exists (
    select 1
    from jsonb_array_elements(payload->'revisions') revision,
      jsonb_array_elements_text(coalesce(revision->'visual_ids', '[]'::jsonb)) visual_id
    group by revision->>'id', visual_id having count(*) > 1
  ) then
    raise exception 'unstable_identifier';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('candidate_package' || E'\\0' || package_id || E'\\0' || package_version, 0)
  );

  select * into receipt
  from public.catalog_import_receipts as ci
  where ci.import_kind = 'candidate_package'
    and ci.package_id = package_id
    and ci.package_version = package_version
  for update;

  if receipt.package_id is not null then
    if receipt.payload_digest <> package_digest then
      raise exception 'package_digest_conflict';
    end if;
    return receipt.result_json;
  end if;

  for source_record in select value from jsonb_array_elements(payload->'sources') loop
    if nullif(btrim(source_record->>'id'), '') is null then raise exception 'unstable_identifier'; end if;
    select * into existing_source from public.sources where id = source_record->>'id' for update;
    if existing_source.id is not null then
      if existing_source.publisher <> source_record->>'publisher'
        or existing_source.title <> source_record->>'title'
        or existing_source.url <> source_record->>'url'
        or existing_source.source_date <> (source_record->>'source_date')::date
        or existing_source.accessed_at <> (source_record->>'accessed_at')::date then
        raise exception 'record_identity_conflict';
      end if;
    else
      insert into public.sources (id, publisher, title, url, source_date, accessed_at)
      values (source_record->>'id', source_record->>'publisher', source_record->>'title',
        source_record->>'url', (source_record->>'source_date')::date, (source_record->>'accessed_at')::date);
    end if;
  end loop;

  for tag_record in select value from jsonb_array_elements(payload->'tags') loop
    if nullif(btrim(tag_record->>'id'), '') is null then raise exception 'unstable_identifier'; end if;
    select * into existing_tag from public.tags where id = tag_record->>'id' for update;
    if existing_tag.id is not null then
      if existing_tag.kind <> tag_record->>'kind' or existing_tag.label <> tag_record->>'label' then
        raise exception 'record_identity_conflict';
      end if;
    else
      insert into public.tags (id, kind, label)
      values (tag_record->>'id', tag_record->>'kind', tag_record->>'label');
    end if;
  end loop;

  for food_record in select value from jsonb_array_elements(payload->'foods') loop
    if nullif(btrim(food_record->>'id'), '') is null or nullif(btrim(food_record->>'slug'), '') is null then
      raise exception 'unstable_identifier';
    end if;
    select * into existing_food from public.foods where id = food_record->>'id' for update;
    if existing_food.id is not null then
      if existing_food.slug <> food_record->>'slug'
        or existing_food.name <> food_record->>'name'
        or existing_food.category <> food_record->>'category' then
        raise exception 'record_identity_conflict';
      end if;
    else
      insert into public.foods (id, slug, name, category)
      values (food_record->>'id', food_record->>'slug', food_record->>'name', food_record->>'category');
    end if;
  end loop;

  for preparation_record in select value from jsonb_array_elements(payload->'preparations') loop
    if nullif(btrim(preparation_record->>'id'), '') is null or nullif(btrim(preparation_record->>'slug'), '') is null then
      raise exception 'unstable_identifier';
    end if;
    if not exists (select 1 from public.foods where id = preparation_record->>'food_id') then
      raise exception 'unknown_source';
    end if;
    select * into existing_preparation from public.preparations where id = preparation_record->>'id' for update;
    if existing_preparation.id is not null then
      if existing_preparation.food_id <> preparation_record->>'food_id'
        or existing_preparation.slug <> preparation_record->>'slug'
        or existing_preparation.name <> preparation_record->>'name'
        or existing_preparation.is_active <> (preparation_record->>'is_active')::boolean then
        raise exception 'record_identity_conflict';
      end if;
    else
      insert into public.preparations (id, food_id, slug, name, is_active)
      values (preparation_record->>'id', preparation_record->>'food_id', preparation_record->>'slug',
        preparation_record->>'name', coalesce((preparation_record->>'is_active')::boolean, false));
    end if;
  end loop;

  for revision_record in select value from jsonb_array_elements(payload->'revisions') loop
    revision_id := nullif(btrim(revision_record->>'id'), '');
    if revision_id is null or nullif(btrim(revision_record->>'preparation_id'), '') is null
      or nullif(btrim(revision_record->>'source_id'), '') is null then
      raise exception 'unstable_identifier';
    end if;
    if (revision_record ? 'status' and coalesce(revision_record->>'status', 'draft') <> 'draft')
      or (revision_record ? 'reviewer_role' and nullif(btrim(revision_record->>'reviewer_role'), '') is not null)
      or (revision_record ? 'reviewed_at' and revision_record->'reviewed_at' <> 'null')
      or (revision_record ? 'approved_at' and revision_record->'approved_at' <> 'null')
      or (revision_record ? 'next_review_at' and revision_record->'next_review_at' <> 'null') then
      raise exception 'candidate_status_forbidden';
    end if;
    if not exists (select 1 from public.preparations where id = revision_record->>'preparation_id')
      or not exists (select 1 from public.sources where id = revision_record->>'source_id') then
      raise exception 'unknown_source';
    end if;
    select * into existing_revision from public.content_revisions where id = revision_id for update;
    if existing_revision.id is not null then
      if existing_revision.preparation_id <> revision_record->>'preparation_id'
        or existing_revision.version <> (revision_record->>'version')::integer
        or existing_revision.status <> 'draft'
        or existing_revision.method <> revision_record->>'method'
        or existing_revision.shape_texture <> revision_record->>'shape_texture'
        or existing_revision.source_id <> revision_record->>'source_id' then
        raise exception 'record_identity_conflict';
      end if;
    else
      insert into public.content_revisions (
        id, preparation_id, version, status, method, shape_texture, source_id
      ) values (
        revision_id, revision_record->>'preparation_id', (revision_record->>'version')::integer,
        'draft', revision_record->>'method', revision_record->>'shape_texture', revision_record->>'source_id'
      );
    end if;

    select coalesce(jsonb_agg(tag_id order by tag_id), '[]'::jsonb)
      into expected_tags
    from jsonb_array_elements_text(coalesce(revision_record->'tag_ids', '[]'::jsonb)) tag_id;
    select coalesce(jsonb_agg(tag_id order by tag_id), '[]'::jsonb)
      into actual_tags
    from public.revision_tags where revision_tags.revision_id = revision_id;
    if actual_tags <> expected_tags then
      if exists (select 1 from public.revision_tags where revision_tags.revision_id = revision_id) then
        raise exception 'record_identity_conflict';
      end if;
      for tag_record in select jsonb_build_object('id', value) from jsonb_array_elements_text(coalesce(revision_record->'tag_ids', '[]'::jsonb)) loop
        if not exists (select 1 from public.tags where tags.id = tag_record->>'id') then raise exception 'unknown_tag'; end if;
        insert into public.revision_tags (revision_id, tag_id) values (revision_id, tag_record->>'id');
      end loop;
    end if;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', rule_value->>'id',
          'support_status', rule_value->>'support_status',
          'deadline_kind', nullif(rule_value->>'deadline_kind', ''),
          'duration_hours', nullif(rule_value->>'duration_hours', '')::integer,
          'guidance', nullif(rule_value->>'guidance', '')
        ) order by rule_value->>'id'
      ), '[]'::jsonb
    ) into expected_rules
    from jsonb_array_elements(coalesce(revision_record->'storage_rules', '[]'::jsonb)) rule_values(rule_value);
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', storage_rules.id,
          'support_status', storage_rules.support_status,
          'deadline_kind', storage_rules.deadline_kind,
          'duration_hours', storage_rules.duration_hours,
          'guidance', storage_rules.guidance
        ) order by storage_rules.id
      ), '[]'::jsonb
    ) into actual_rules
    from public.storage_rules
    where storage_rules.revision_id = revision_id;
    if actual_rules <> expected_rules and actual_rules <> '[]'::jsonb then
      raise exception 'record_identity_conflict';
    end if;

    for rule_record in select value from jsonb_array_elements(coalesce(revision_record->'storage_rules', '[]'::jsonb)) loop
      if nullif(btrim(rule_record->>'id'), '') is null then raise exception 'invalid_storage_contract'; end if;
      select * into existing_rule from public.storage_rules where id = rule_record->>'id' for update;
      if existing_rule.id is not null then
        if existing_rule.revision_id <> revision_id
          or existing_rule.support_status <> rule_record->>'support_status'
          or existing_rule.deadline_kind is distinct from nullif(rule_record->>'deadline_kind', '')
          or existing_rule.duration_hours is distinct from nullif(rule_record->>'duration_hours', '')::integer
          or existing_rule.guidance is distinct from nullif(rule_record->>'guidance', '') then
          raise exception 'record_identity_conflict';
        end if;
      else
        insert into public.storage_rules (id, revision_id, support_status, deadline_kind, duration_hours, guidance)
        values (rule_record->>'id', revision_id, rule_record->>'support_status',
          nullif(rule_record->>'deadline_kind', ''), nullif(rule_record->>'duration_hours', '')::integer,
          nullif(rule_record->>'guidance', ''));
      end if;
    end loop;

    if revision_record->>'visual_required' is null
      or jsonb_typeof(revision_record->'visual_required') <> 'boolean'
      or revision_record->>'preparation_time_band' is null then
      raise exception 'invalid_visual_contract';
    end if;
    select requirement.* into existing_requirement
    from public.revision_visual_requirements requirement
    where requirement.revision_id = revision_id
    for update;
    if existing_requirement.revision_id is null then
      insert into public.revision_visual_requirements (revision_id, requirement_declared, visual_required)
      values (revision_id, true, (revision_record->>'visual_required')::boolean);
    elsif existing_requirement.visual_required <> (revision_record->>'visual_required')::boolean then
      raise exception 'record_identity_conflict';
    end if;
    select metadata.* into existing_metadata
    from public.revision_catalog_metadata metadata
    where metadata.revision_id = revision_id
    for update;
    if existing_metadata.revision_id is null then
      insert into public.revision_catalog_metadata (revision_id, preparation_time_band)
      values (revision_id, revision_record->>'preparation_time_band');
    elsif existing_metadata.preparation_time_band <> revision_record->>'preparation_time_band' then
      raise exception 'record_identity_conflict';
    end if;
  end loop;

  for visual_record in select value from jsonb_array_elements(payload->'visuals') loop
    if nullif(btrim(visual_record->>'id'), '') is null then raise exception 'unstable_identifier'; end if;
    select * into existing_visual from public.catalog_visuals where id = visual_record->>'id' for update;
    if existing_visual.id is not null then
      if existing_visual.asset_reference <> visual_record->>'asset_reference'
        or existing_visual.rights_basis <> visual_record->>'rights_basis'
        or existing_visual.rights_holder <> visual_record->>'rights_holder'
        or existing_visual.license_name is distinct from nullif(visual_record->>'license_name', '')
        or existing_visual.license_url is distinct from nullif(visual_record->>'license_url', '')
        or existing_visual.alt_text <> visual_record->>'alt_text'
        or existing_visual.reviewed_at <> (visual_record->>'reviewed_at')::date then
        raise exception 'record_identity_conflict';
      end if;
    else
      insert into public.catalog_visuals (
        id, asset_reference, rights_basis, rights_holder, license_name, license_url, alt_text, reviewed_at
      ) values (
        visual_record->>'id', visual_record->>'asset_reference', visual_record->>'rights_basis',
        visual_record->>'rights_holder', nullif(visual_record->>'license_name', ''),
        nullif(visual_record->>'license_url', ''), visual_record->>'alt_text', (visual_record->>'reviewed_at')::date
      );
    end if;
  end loop;

  for revision_record in select value from jsonb_array_elements(payload->'revisions') loop
    revision_id := revision_record->>'id';
    select coalesce(jsonb_agg(visual_id order by visual_id), '[]'::jsonb)
      into expected_visuals
    from jsonb_array_elements_text(coalesce(revision_record->'visual_ids', '[]'::jsonb)) visual_id;
    select coalesce(jsonb_agg(visual_id order by visual_id), '[]'::jsonb)
      into actual_visuals
    from public.revision_visuals where revision_visuals.revision_id = revision_id;
    if actual_visuals <> expected_visuals then
      if exists (select 1 from public.revision_visuals where revision_visuals.revision_id = revision_id) then
        raise exception 'record_identity_conflict';
      end if;
      for visual_record in select jsonb_build_object('id', value) from jsonb_array_elements_text(coalesce(revision_record->'visual_ids', '[]'::jsonb)) loop
        if not exists (select 1 from public.catalog_visuals where catalog_visuals.id = visual_record->>'id') then raise exception 'invalid_visual_contract'; end if;
        insert into public.revision_visuals (revision_id, visual_id) values (revision_id, visual_record->>'id');
      end loop;
    end if;
  end loop;

  for mapping_record in select value from jsonb_array_elements(p_envelope->'review_cases') loop
    case_id := nullif(btrim(mapping_record->>'case_id'), '');
    revision_id := nullif(btrim(mapping_record->>'revision_id'), '');
    if case_id is null or revision_id is null
      or case_id !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      or revision_id !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
      raise exception 'unstable_identifier';
    end if;
    if not exists (select 1 from jsonb_array_elements(payload->'revisions') revision where revision->>'id' = revision_id) then
      raise exception 'candidate_revision_mismatch';
    end if;
    select * into existing_case from public.catalog_review_cases where id = case_id for update;
    if existing_case.id is not null then
      if existing_case.revision_id <> revision_id or existing_case.classification <> 'production_candidate' then
        raise exception 'candidate_revision_mismatch';
      end if;
    else
      insert into public.catalog_review_cases (id, revision_id, classification)
      values (case_id, revision_id, 'production_candidate');
      insert into public.catalog_review_case_events (case_id, from_status, to_status, reason)
      values (case_id, null, 'draft', 'Candidate package imported');
    end if;
  end loop;

  if (select count(*) from jsonb_array_elements(p_envelope->'review_cases'))
     <> (select count(*) from jsonb_array_elements(payload->'revisions')) then
    raise exception 'candidate_revision_mismatch';
  end if;

  select jsonb_build_object(
    'accepted', true,
    'import_kind', 'candidate_package',
    'package_id', package_id,
    'package_version', package_version,
    'payload_digest', package_digest,
    'revision_ids', coalesce((select jsonb_agg(item->>'id' order by item->>'id') from jsonb_array_elements(payload->'revisions') item), '[]'::jsonb),
    'case_ids', coalesce((select jsonb_agg(item->>'case_id' order by item->>'case_id') from jsonb_array_elements(p_envelope->'review_cases') item), '[]'::jsonb),
    'counts', jsonb_build_object(
      'sources', jsonb_array_length(payload->'sources'),
      'tags', jsonb_array_length(payload->'tags'),
      'foods', jsonb_array_length(payload->'foods'),
      'preparations', jsonb_array_length(payload->'preparations'),
      'revisions', jsonb_array_length(payload->'revisions'),
      'review_cases', jsonb_array_length(p_envelope->'review_cases')
    )
  ) into result;

  insert into public.catalog_import_receipts (
    import_kind, package_id, package_version, schema_version, payload_digest,
    package_created_at, result_json
  ) values (
    'candidate_package', package_id, package_version, p_envelope->>'schema_version',
    package_digest, package_created_at, result
  );

  return result;
end;
$$;

revoke all on function public.import_catalog_candidate_package(jsonb)
  from public, anon, authenticated;
grant execute on function public.import_catalog_candidate_package(jsonb)
  to service_role;

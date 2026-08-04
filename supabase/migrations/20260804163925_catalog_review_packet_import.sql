create unique index catalog_review_submissions_one_successor
  on public.catalog_review_submissions(supersedes_submission_id)
  where supersedes_submission_id is not null;

create or replace function public.import_catalog_review_packet(p_envelope jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  packet jsonb;
  submission_record jsonb;
  evidence_record jsonb;
  review_case public.catalog_review_cases%rowtype;
  revision public.content_revisions%rowtype;
  receipt public.catalog_import_receipts%rowtype;
  package_id text;
  package_version text;
  package_digest text;
  package_created_at timestamptz;
  current_tip text;
  predecessor text;
  inserted_ids text[] := '{}';
  total_submissions integer;
  inserted_count integer := 0;
  progress boolean;
  result jsonb;
  dimension_text text;
  authority_valid boolean;
begin
  if p_envelope is null or jsonb_typeof(p_envelope) <> 'object' then
    raise exception 'review_packet_identity_missing';
  end if;

  if p_envelope->>'schema_version' <> 'qualified-review-packet/v1' then
    raise exception 'unsupported_schema_version';
  end if;

  package_id := nullif(btrim(p_envelope->>'package_id'), '');
  package_version := nullif(btrim(p_envelope->>'package_version'), '');
  if package_id is null or package_version is null
    or p_envelope->>'package_created_at' is null then
    raise exception 'review_packet_identity_missing';
  end if;

  if p_envelope->>'classification' <> 'production_candidate'
    or p_envelope ? 'owner_adjudications'
    or p_envelope ? 'publication_status'
    or p_envelope ? 'approved_at' then
    raise exception 'review_packet_forbidden';
  end if;

  if nullif(btrim(p_envelope->>'case_id'), '') is null
    or p_envelope->>'case_id' !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    or nullif(btrim(p_envelope->>'revision_id'), '') is null
    or jsonb_typeof(p_envelope->'submissions') <> 'array' then
    raise exception 'review_packet_identity_missing';
  end if;

  package_digest := private.catalog_import_digest(p_envelope);
  if p_envelope->>'payload_digest' <> package_digest then
    raise exception 'package_digest_conflict';
  end if;
  package_created_at := (p_envelope->>'package_created_at')::timestamptz;

  if exists (
    select 1 from jsonb_array_elements(p_envelope->'submissions') item
    group by item->>'id' having count(*) > 1
  ) or exists (
    select 1
    from jsonb_array_elements(p_envelope->'submissions') item,
      jsonb_array_elements(coalesce(item->'evidence', '[]'::jsonb)) evidence
    group by evidence->>'id' having count(*) > 1
  ) then
    raise exception 'unstable_identifier';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('qualified_review_packet' || E'\\0' || package_id || E'\\0' || package_version, 0)
  );

  select * into receipt
  from public.catalog_import_receipts as ci
  where ci.import_kind = 'qualified_review_packet'
    and ci.package_id = p_envelope->>'package_id'
    and ci.package_version = p_envelope->>'package_version'
  for update;
  if receipt.package_id is not null then
    if receipt.payload_digest <> package_digest then
      raise exception 'package_digest_conflict';
    end if;
    return receipt.result_json;
  end if;

  select * into review_case
  from public.catalog_review_cases
  where id = p_envelope->>'case_id'
  for update;
  if review_case.id is null then raise exception 'review_case_missing'; end if;
  if review_case.revision_id <> p_envelope->>'revision_id'
    or review_case.classification <> 'production_candidate' then
    raise exception 'review_case_mismatch';
  end if;
  if review_case.status::text = 'completed' then raise exception 'review_case_completed'; end if;
  if review_case.status::text = 'blocked' then raise exception 'review_case_blocked'; end if;

  select * into revision from public.content_revisions
  where id = review_case.revision_id for update;
  if revision.id is null or revision.status <> 'draft' then
    raise exception 'candidate_status_forbidden';
  end if;

  total_submissions := jsonb_array_length(p_envelope->'submissions');
  if total_submissions = 0 then raise exception 'review_submission_missing'; end if;

  -- Insert roots before descendants so a packet can contain several rounds.
  while inserted_count < total_submissions loop
    progress := false;
    for submission_record in
      select item
      from jsonb_array_elements(p_envelope->'submissions') item
      where not ((item->>'id') = any(inserted_ids))
      order by (item->>'supersedes_submission_id') is not null, item->>'id'
    loop
      predecessor := nullif(btrim(submission_record->>'supersedes_submission_id'), '');
      if predecessor is not null
        and not exists (select 1 from public.catalog_review_submissions where id = predecessor) then
        continue;
      end if;

      if nullif(btrim(submission_record->>'id'), '') is null
        or submission_record->>'id' !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
        or submission_record->>'dimension' is null
        or submission_record->>'decision' is null
        or nullif(btrim(submission_record->>'reviewer_role'), '') is null
        or nullif(btrim(submission_record->>'reviewer_authority_reference'), '') is null
        or submission_record->>'reviewed_at' is null
        or jsonb_typeof(submission_record->'storage_context') <> 'object'
        or jsonb_typeof(submission_record->'visual_context') <> 'object' then
        raise exception 'review_submission_invalid';
      end if;

      dimension_text := submission_record->>'dimension';
      if dimension_text not in (
        'feeding_safety_developmental', 'allergy_restriction',
        'nutrition_age_stage', 'taxonomy_labeling', 'storage_handling',
        'visual_accessibility_rights'
      ) then raise exception 'review_dimension_invalid'; end if;

      if not exists (
        select 1 from public.catalog_reviewer_authority_dimensions ad
        join public.catalog_reviewer_authorities a on a.reference = ad.authority_reference
        where ad.authority_reference = submission_record->>'reviewer_authority_reference'
          and ad.dimension::text = dimension_text
          and (a.valid_from is null or a.valid_from <= (submission_record->>'reviewed_at')::date)
          and (a.valid_until is null or a.valid_until >= (submission_record->>'reviewed_at')::date)
      ) then raise exception 'review_authority_invalid'; end if;

      if dimension_text = 'storage_handling' then
        if submission_record->>'storage_support_state' not in ('supported', 'unsupported', 'unknown') then
          raise exception 'storage_context_missing';
        end if;
      elsif submission_record ? 'storage_support_state'
        and submission_record->>'storage_support_state' is not null then
        raise exception 'storage_context_forbidden';
      end if;

      if not exists (select 1 from jsonb_array_elements(coalesce(submission_record->'evidence', '[]'::jsonb))) then
        raise exception 'review_evidence_missing';
      end if;

      if predecessor is null then
        if exists (
          select 1 from public.catalog_review_submissions current_submission
          where current_submission.case_id = review_case.id
            and current_submission.dimension::text = dimension_text
            and not exists (
              select 1 from public.catalog_review_submissions successor
              where successor.supersedes_submission_id = current_submission.id
            )
        ) then raise exception 'review_round_conflict'; end if;
      else
        select current_submission.id into current_tip
        from public.catalog_review_submissions current_submission
        where current_submission.case_id = review_case.id
          and current_submission.dimension::text = dimension_text
          and not exists (
            select 1 from public.catalog_review_submissions successor
            where successor.supersedes_submission_id = current_submission.id
          );
        if current_tip is distinct from predecessor then raise exception 'review_round_conflict'; end if;
      end if;

      if exists (select 1 from public.catalog_review_submissions where id = submission_record->>'id') then
        raise exception 'submission_identity_conflict';
      end if;

      perform public.submit_catalog_review(
        submission_record->>'id', review_case.id, review_case.revision_id,
        dimension_text, submission_record->>'decision', submission_record->>'reviewer_role',
        submission_record->>'reviewer_authority_reference', (submission_record->>'reviewed_at')::date,
        coalesce(submission_record->>'follow_up_status', 'none'),
        coalesce((submission_record->>'clarification_requires_catalog_change')::boolean, false),
        nullif(submission_record->>'proposed_replacement_or_addition', ''),
        nullif(submission_record->>'notes', ''),
        case when dimension_text = 'storage_handling' then submission_record->>'storage_support_state' else null end,
        submission_record->'storage_context', submission_record->'visual_context', predecessor
      );

      for evidence_record in
        select value from jsonb_array_elements(coalesce(submission_record->'evidence', '[]'::jsonb))
      loop
        if nullif(btrim(evidence_record->>'id'), '') is null
          or evidence_record->>'id' !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
          or nullif(btrim(evidence_record->>'field_or_claim'), '') is null
          or nullif(btrim(evidence_record->>'evidence_reference'), '') is null then
          raise exception 'review_evidence_invalid';
        end if;
        if evidence_record ? 'source_id' and evidence_record->>'source_id' is not null
          and not exists (select 1 from public.sources where id = evidence_record->>'source_id') then
          raise exception 'review_evidence_source_missing';
        end if;
        perform public.record_catalog_review_evidence(
          evidence_record->>'id', submission_record->>'id', evidence_record->>'field_or_claim',
          evidence_record->>'evidence_reference', nullif(evidence_record->>'source_id', '')
        );
        insert into public.catalog_review_submission_approval_references(submission_id, approval_reference_id)
        values (submission_record->>'id', nullif(btrim(submission_record->>'approval_reference_id'), ''))
        on conflict (submission_id) do nothing;
      end loop;

      if not exists (
        select 1 from public.catalog_review_submission_approval_references
        where submission_id = submission_record->>'id'
          and btrim(approval_reference_id) <> ''
      ) then raise exception 'approval_reference_missing'; end if;

      inserted_ids := array_append(inserted_ids, submission_record->>'id');
      inserted_count := inserted_count + 1;
      progress := true;
    end loop;
    if not progress then raise exception 'review_round_conflict'; end if;
  end loop;

  if review_case.status::text = 'draft' then
    perform public.transition_catalog_review_case(review_case.id, 'ready_for_review', 'Qualified review packet imported');
    perform public.transition_catalog_review_case(review_case.id, 'in_review', 'Qualified review packet imported');
    review_case.status := 'in_review';
  elsif review_case.status::text = 'changes_requested' then
    perform public.transition_catalog_review_case(review_case.id, 'in_review', 'Qualified review packet imported');
    review_case.status := 'in_review';
  end if;

  select jsonb_build_object(
    'accepted', true,
    'import_kind', 'qualified_review_packet',
    'package_id', package_id,
    'package_version', package_version,
    'payload_digest', package_digest,
    'case_id', review_case.id,
    'revision_id', review_case.revision_id,
    'status', review_case.status::text,
    'submission_ids', coalesce((select jsonb_agg(item->>'id' order by item->>'id') from jsonb_array_elements(p_envelope->'submissions') item), '[]'::jsonb),
    'evidence_ids', coalesce((select jsonb_agg(evidence->>'id' order by evidence->>'id') from jsonb_array_elements(p_envelope->'submissions') item, jsonb_array_elements(coalesce(item->'evidence', '[]'::jsonb)) evidence), '[]'::jsonb)
  ) into result;

  insert into public.catalog_import_receipts(
    import_kind, package_id, package_version, schema_version, payload_digest,
    package_created_at, result_json
  ) values (
    'qualified_review_packet', package_id, package_version, p_envelope->>'schema_version',
    package_digest, package_created_at, result
  );
  return result;
end;
$$;

revoke all on function public.import_catalog_review_packet(jsonb)
  from public, anon, authenticated;
grant execute on function public.import_catalog_review_packet(jsonb)
  to service_role;

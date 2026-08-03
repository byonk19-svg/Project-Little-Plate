create type public.catalog_review_case_status as enum (
  'draft',
  'ready_for_review',
  'in_review',
  'changes_requested',
  'blocked',
  'completed'
);

create type public.catalog_review_dimension as enum (
  'feeding_safety_developmental',
  'allergy_restriction',
  'nutrition_age_stage',
  'taxonomy_labeling',
  'storage_handling',
  'visual_accessibility_rights'
);

create type public.catalog_review_decision as enum (
  'Accept',
  'Accept with clarification',
  'Revise',
  'Block',
  'Not applicable',
  'Insufficient evidence'
);

create table public.catalog_reviewer_authorities (
  reference text primary key check (btrim(reference) <> ''),
  authority_basis text not null check (btrim(authority_basis) <> ''),
  evidence_location text not null check (btrim(evidence_location) <> ''),
  valid_from date,
  valid_until date,
  created_at timestamptz not null default now(),
  check (valid_until is null or valid_from is null or valid_until >= valid_from)
);

create table public.catalog_reviewer_authority_dimensions (
  authority_reference text not null
    references public.catalog_reviewer_authorities(reference)
    on delete restrict,
  dimension public.catalog_review_dimension not null,
  primary key (authority_reference, dimension)
);

create table public.catalog_review_cases (
  id text primary key check (id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  revision_id text not null unique
    references public.content_revisions(id) on delete restrict,
  classification text not null check (classification in (
    'production_candidate',
    'production',
    'seed',
    'demo',
    'fixture',
    'test'
  )),
  status public.catalog_review_case_status not null default 'draft',
  status_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.catalog_review_case_events (
  id bigint generated always as identity primary key,
  case_id text not null references public.catalog_review_cases(id)
    on delete restrict,
  from_status text,
  to_status public.catalog_review_case_status not null,
  reason text not null check (btrim(reason) <> ''),
  recorded_at timestamptz not null default now(),
  check (from_status is null or from_status::text in (
    'draft', 'ready_for_review', 'in_review', 'changes_requested', 'blocked', 'completed'
  ))
);

create table public.catalog_review_submissions (
  id text primary key check (id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  case_id text not null references public.catalog_review_cases(id)
    on delete restrict,
  revision_id text not null references public.content_revisions(id)
    on delete restrict,
  dimension public.catalog_review_dimension not null,
  decision public.catalog_review_decision not null,
  reviewer_role text not null check (btrim(reviewer_role) <> ''),
  reviewer_authority_reference text not null
    references public.catalog_reviewer_authorities(reference)
    on delete restrict,
  reviewed_at date not null,
  follow_up_status text not null default 'none' check (follow_up_status in (
    'none',
    'resolved',
    'required',
    'unresolved'
  )),
  clarification_requires_catalog_change boolean not null default false,
  proposed_replacement_or_addition text,
  notes text,
  storage_support_state text check (storage_support_state in (
    'supported',
    'unsupported',
    'unknown'
  )),
  storage_context jsonb not null default '{}'::jsonb,
  visual_context jsonb not null default '{}'::jsonb,
  supersedes_submission_id text references public.catalog_review_submissions(id)
    on delete restrict,
  submitted_at timestamptz not null default now(),
  check (
    (dimension = 'storage_handling' and storage_support_state is not null)
    or (dimension <> 'storage_handling' and storage_support_state is null)
  ),
  check (jsonb_typeof(storage_context) = 'object'),
  check (jsonb_typeof(visual_context) = 'object')
);

create table public.catalog_review_submission_evidence (
  id text primary key check (id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  submission_id text not null references public.catalog_review_submissions(id)
    on delete restrict,
  field_or_claim text not null check (btrim(field_or_claim) <> ''),
  evidence_reference text not null check (btrim(evidence_reference) <> ''),
  source_id text references public.sources(id) on delete restrict,
  recorded_at timestamptz not null default now()
);

create table public.catalog_owner_adjudications (
  id text primary key check (id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  case_id text not null references public.catalog_review_cases(id)
    on delete restrict,
  dimension public.catalog_review_dimension not null,
  selected_submission_id text not null
    references public.catalog_review_submissions(id) on delete restrict,
  outcome text not null check (outcome in (
    'select_qualified_recommendation',
    'record_compatible_conflict',
    'return_for_revision',
    'decline_release'
  )),
  notes text not null check (btrim(notes) <> ''),
  implementation_reference text,
  recorded_at timestamptz not null default now()
);

create unique index catalog_owner_adjudications_one_per_dimension
  on public.catalog_owner_adjudications(case_id, dimension);

alter table public.catalog_reviewer_authorities enable row level security;
alter table public.catalog_reviewer_authority_dimensions enable row level security;
alter table public.catalog_review_cases enable row level security;
alter table public.catalog_review_case_events enable row level security;
alter table public.catalog_review_submissions enable row level security;
alter table public.catalog_review_submission_evidence enable row level security;
alter table public.catalog_owner_adjudications enable row level security;

revoke all on table public.catalog_reviewer_authorities
  from public, anon, authenticated, service_role;
revoke all on table public.catalog_reviewer_authority_dimensions
  from public, anon, authenticated, service_role;
revoke all on table public.catalog_review_cases
  from public, anon, authenticated, service_role;
revoke all on table public.catalog_review_case_events
  from public, anon, authenticated, service_role;
revoke all on table public.catalog_review_submissions
  from public, anon, authenticated, service_role;
revoke all on table public.catalog_review_submission_evidence
  from public, anon, authenticated, service_role;
revoke all on table public.catalog_owner_adjudications
  from public, anon, authenticated, service_role;

grant select on table public.catalog_reviewer_authorities
  to service_role;
grant select on table public.catalog_reviewer_authority_dimensions
  to service_role;
grant select on table public.catalog_review_cases
  to service_role;
grant select on table public.catalog_review_case_events
  to service_role;
grant select on table public.catalog_review_submissions
  to service_role;
grant select on table public.catalog_review_submission_evidence
  to service_role;
grant select on table public.catalog_owner_adjudications
  to service_role;

create or replace function public.prevent_catalog_review_history_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Catalog review history is append-only'
    using errcode = '55000';
end;
$$;

create trigger catalog_reviewer_authorities_append_only
before update or delete on public.catalog_reviewer_authorities
for each row execute function public.prevent_catalog_review_history_changes();

create trigger catalog_reviewer_authority_dimensions_append_only
before update or delete on public.catalog_reviewer_authority_dimensions
for each row execute function public.prevent_catalog_review_history_changes();

create trigger catalog_review_case_events_append_only
before update or delete on public.catalog_review_case_events
for each row execute function public.prevent_catalog_review_history_changes();

create trigger catalog_review_submissions_append_only
before update or delete on public.catalog_review_submissions
for each row execute function public.prevent_catalog_review_history_changes();

create trigger catalog_review_submission_evidence_append_only
before update or delete on public.catalog_review_submission_evidence
for each row execute function public.prevent_catalog_review_history_changes();

create trigger catalog_owner_adjudications_append_only
before update or delete on public.catalog_owner_adjudications
for each row execute function public.prevent_catalog_review_history_changes();

create or replace function public.validate_catalog_review_submission()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  expected_revision_id text;
  superseded_record public.catalog_review_submissions%rowtype;
begin
  select revision_id into expected_revision_id
  from public.catalog_review_cases
  where id = new.case_id;

  if expected_revision_id is null or expected_revision_id <> new.revision_id then
    raise exception 'Review submission revision does not match its case'
      using errcode = '22023';
  end if;

  if new.supersedes_submission_id is not null then
    select * into superseded_record
    from public.catalog_review_submissions
    where id = new.supersedes_submission_id;

    if superseded_record.id is null
      or superseded_record.case_id <> new.case_id
      or superseded_record.revision_id <> new.revision_id
      or superseded_record.dimension <> new.dimension then
      raise exception 'Superseded review must match case, revision, and dimension'
        using errcode = '22023';
    end if;
  end if;

  if new.dimension = 'storage_handling'
    and new.storage_support_state is null then
    raise exception 'Storage review requires an explicit support state'
      using errcode = '22023';
  end if;

  if new.dimension <> 'storage_handling'
    and new.storage_support_state is not null then
    raise exception 'Storage support state is only valid for storage review'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger catalog_review_submission_validate
before insert on public.catalog_review_submissions
for each row execute function public.validate_catalog_review_submission();

create or replace function public.register_catalog_reviewer_authority(
  p_reference text,
  p_authority_basis text,
  p_evidence_location text,
  p_dimensions text[],
  p_valid_from date default null,
  p_valid_until date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  dimension_value text;
begin
  if p_reference is null or btrim(p_reference) = ''
    or p_authority_basis is null or btrim(p_authority_basis) = ''
    or p_evidence_location is null or btrim(p_evidence_location) = ''
    or p_dimensions is null or cardinality(p_dimensions) = 0 then
    raise exception 'Reviewer authority requires reference, basis, evidence, and dimensions'
      using errcode = '22023';
  end if;

  foreach dimension_value in array p_dimensions loop
    if dimension_value not in (
      'feeding_safety_developmental',
      'allergy_restriction',
      'nutrition_age_stage',
      'taxonomy_labeling',
      'storage_handling',
      'visual_accessibility_rights'
    ) then
      raise exception 'Reviewer authority contains an unknown dimension'
        using errcode = '22023';
    end if;
  end loop;

  insert into public.catalog_reviewer_authorities (
    reference, authority_basis, evidence_location, valid_from, valid_until
  ) values (
    p_reference, p_authority_basis, p_evidence_location,
    p_valid_from, p_valid_until
  );

  foreach dimension_value in array p_dimensions loop
    insert into public.catalog_reviewer_authority_dimensions (
      authority_reference, dimension
    ) values (p_reference, dimension_value::public.catalog_review_dimension);
  end loop;

  return jsonb_build_object('reference', p_reference);
end;
$$;

create or replace function public.create_catalog_review_case(
  p_case_id text,
  p_revision_id text,
  p_classification text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  preparation_record public.preparations%rowtype;
  food_record public.foods%rowtype;
  revision_status text;
begin
  if p_case_id is null or p_case_id !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    or p_revision_id is null or btrim(p_revision_id) = '' then
    raise exception 'Candidate review case requires stable identifiers'
      using errcode = '22023';
  end if;

  if p_classification is null or p_classification not in (
    'production_candidate', 'production', 'seed', 'demo', 'fixture', 'test'
  ) then
    raise exception 'Candidate review case has an invalid classification'
      using errcode = '22023';
  end if;

  select status into revision_status
  from public.content_revisions
  where id = p_revision_id;
  if revision_status is null then
    raise exception 'Candidate review case references an unknown revision'
      using errcode = '22023';
  end if;
  if revision_status = 'approved' then
    raise exception 'Approved revisions cannot begin a candidate review case'
      using errcode = '55000';
  end if;

  select preparations.* into preparation_record
  from public.preparations
  join public.content_revisions
    on content_revisions.preparation_id = preparations.id
  where content_revisions.id = p_revision_id;
  select foods.* into food_record
  from public.foods
  where foods.id = preparation_record.food_id;

  if preparation_record.id is null
    or food_record.id is null
    or preparation_record.slug is null
    or preparation_record.slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    or food_record.slug is null
    or food_record.slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'Candidate review case requires stable catalog identifiers'
      using errcode = '22023';
  end if;

  insert into public.catalog_review_cases (
    id, revision_id, classification
  ) values (
    p_case_id, p_revision_id, p_classification
  );

  insert into public.catalog_review_case_events (
    case_id, from_status, to_status, reason
  ) values (
    p_case_id, null, 'draft', 'Candidate review case created'
  );

  return jsonb_build_object(
    'case_id', p_case_id,
    'revision_id', p_revision_id,
    'status', 'draft'
  );
end;
$$;

create or replace function public.submit_catalog_review(
  p_submission_id text,
  p_case_id text,
  p_revision_id text,
  p_dimension text,
  p_decision text,
  p_reviewer_role text,
  p_reviewer_authority_reference text,
  p_reviewed_at date,
  p_follow_up_status text default 'none',
  p_clarification_requires_catalog_change boolean default false,
  p_proposed_replacement_or_addition text default null,
  p_notes text default null,
  p_storage_support_state text default null,
  p_storage_context jsonb default '{}'::jsonb,
  p_visual_context jsonb default '{}'::jsonb,
  p_supersedes_submission_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_submission_id is null or p_submission_id !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    or p_dimension is null or p_decision is null
    or p_reviewer_authority_reference is null then
    raise exception 'Review submission requires stable identity, dimension, decision, and authority'
      using errcode = '22023';
  end if;

  insert into public.catalog_review_submissions (
    id, case_id, revision_id, dimension, decision, reviewer_role,
    reviewer_authority_reference, reviewed_at, follow_up_status,
    clarification_requires_catalog_change, proposed_replacement_or_addition,
    notes, storage_support_state, storage_context, visual_context,
    supersedes_submission_id
  ) values (
    p_submission_id, p_case_id, p_revision_id,
    p_dimension::public.catalog_review_dimension,
    p_decision::public.catalog_review_decision,
    p_reviewer_role, p_reviewer_authority_reference, p_reviewed_at,
    p_follow_up_status, p_clarification_requires_catalog_change,
    p_proposed_replacement_or_addition, p_notes, p_storage_support_state,
    p_storage_context, p_visual_context, p_supersedes_submission_id
  );

  return jsonb_build_object('submission_id', p_submission_id);
end;
$$;

create or replace function public.record_catalog_review_evidence(
  p_evidence_id text,
  p_submission_id text,
  p_field_or_claim text,
  p_evidence_reference text,
  p_source_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_evidence_id is null
    or p_evidence_id !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    or p_submission_id is null
    or p_field_or_claim is null or btrim(p_field_or_claim) = ''
    or p_evidence_reference is null or btrim(p_evidence_reference) = '' then
    raise exception 'Review evidence requires stable identity, claim, and reference'
      using errcode = '22023';
  end if;

  insert into public.catalog_review_submission_evidence (
    id, submission_id, field_or_claim, evidence_reference, source_id
  ) values (
    p_evidence_id, p_submission_id, p_field_or_claim,
    p_evidence_reference, p_source_id
  );

  return jsonb_build_object('evidence_id', p_evidence_id);
end;
$$;

create or replace function public.record_catalog_owner_adjudication(
  p_adjudication_id text,
  p_case_id text,
  p_dimension text,
  p_outcome text,
  p_notes text,
  p_implementation_reference text default null,
  p_selected_submission_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_adjudication_id is null
    or p_adjudication_id !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    or p_notes is null or btrim(p_notes) = '' then
    raise exception 'Owner adjudication requires stable identity and notes'
      using errcode = '22023';
  end if;

  if p_selected_submission_id is null then
    raise exception 'Owner adjudication must select an exact qualified submission'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.catalog_review_submissions submission
    where submission.id = p_selected_submission_id
      and submission.case_id = p_case_id
      and submission.dimension::text = p_dimension
      and submission.decision in ('Accept', 'Accept with clarification')
      and submission.follow_up_status not in ('required', 'unresolved')
      and not submission.clarification_requires_catalog_change
      and not exists (
        select 1
        from public.catalog_review_submissions superseding
        where superseding.supersedes_submission_id = submission.id
      )
  ) then
    raise exception 'Owner adjudication selection is not a current eligible submission'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.catalog_owner_adjudications existing
    where existing.case_id = p_case_id
      and existing.dimension::text = p_dimension
  ) then
    raise exception 'Only one effective owner adjudication is allowed per case dimension'
      using errcode = '22023';
  end if;

  insert into public.catalog_owner_adjudications (
    id, case_id, dimension, selected_submission_id, outcome, notes, implementation_reference
  ) values (
    p_adjudication_id, p_case_id,
    p_dimension::public.catalog_review_dimension, p_selected_submission_id, p_outcome,
    p_notes, p_implementation_reference
  );

  return jsonb_build_object('adjudication_id', p_adjudication_id);
end;
$$;

create or replace function public.get_catalog_review_eligibility(
  p_case_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  review_case public.catalog_review_cases%rowtype;
  revision_record public.content_revisions%rowtype;
  preparation_record public.preparations%rowtype;
  food_record public.foods%rowtype;
  dimension_value text;
  effective_review public.catalog_review_submissions%rowtype;
  effective_count integer;
  evidence_count integer;
  authority_covered boolean;
  visual_required boolean;
  reasons jsonb := '[]'::jsonb;
begin
  select * into review_case
  from public.catalog_review_cases
  where id = p_case_id;

  if review_case.id is null then
    return jsonb_build_object(
      'eligible', false,
      'case_id', p_case_id,
      'reason_codes', jsonb_build_array(
        jsonb_build_object('code', 'missing_case')
      )
    );
  end if;

  select * into revision_record
  from public.content_revisions
  where id = review_case.revision_id;
  select * into preparation_record
  from public.preparations
  where id = revision_record.preparation_id;
  select * into food_record
  from public.foods
  where id = preparation_record.food_id;

  if review_case.classification <> 'production_candidate' then
    reasons := reasons || jsonb_build_array(
      jsonb_build_object('code', 'synthetic_classification')
    );
  end if;

  if review_case.status not in ('in_review', 'completed')
    or (review_case.status = 'completed' and revision_record.status = 'approved')
    or (review_case.status <> 'completed' and revision_record.status = 'approved') then
    reasons := reasons || jsonb_build_array(
      jsonb_build_object('code', 'contradictory_lifecycle_state')
    );
  end if;

  if revision_record.id is null
    or preparation_record.id is null
    or food_record.id is null
    or review_case.id !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    or preparation_record.slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    or food_record.slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    reasons := reasons || jsonb_build_array(
      jsonb_build_object('code', 'missing_stable_identifier')
    );
  end if;

  select exists (
    select 1 from public.revision_visual_requirements requirement
    where requirement.revision_id = review_case.revision_id
      and requirement.visual_required
  ) or exists (
    select 1 from public.revision_visuals visual
    where visual.revision_id = review_case.revision_id
  ) into visual_required;

  foreach dimension_value in array array[
    'feeding_safety_developmental',
    'allergy_restriction',
    'nutrition_age_stage',
    'taxonomy_labeling',
    'storage_handling',
    'visual_accessibility_rights'
  ] loop
    if dimension_value = 'visual_accessibility_rights' and not visual_required then
      continue;
    end if;
    select count(*) into effective_count
    from public.catalog_review_submissions submission
    where submission.case_id = review_case.id
      and submission.dimension::text = dimension_value
      and not exists (
        select 1
        from public.catalog_review_submissions superseding
        where superseding.supersedes_submission_id = submission.id
      );

    if effective_count = 0 then
      reasons := reasons || jsonb_build_array(jsonb_build_object(
        'code', case when dimension_value = 'visual_accessibility_rights'
          then 'missing_conditional_visual_review'
          else 'missing_required_dimension' end,
        'dimension', dimension_value
      ));
      continue;
    end if;
    if effective_count > 1 then
      if exists (
        select 1
        from public.catalog_review_submissions submission
        where submission.case_id = review_case.id
          and submission.dimension::text = dimension_value
          and not exists (
            select 1 from public.catalog_review_submissions superseding
            where superseding.supersedes_submission_id = submission.id
          )
          and (
            submission.decision in ('Block', 'Revise', 'Insufficient evidence')
            or submission.follow_up_status in ('required', 'unresolved')
            or submission.clarification_requires_catalog_change
          )
      ) then
        if exists (select 1 from public.catalog_review_submissions submission
          where submission.case_id = review_case.id
            and submission.dimension::text = dimension_value
            and submission.decision = 'Block'
            and not exists (select 1 from public.catalog_review_submissions superseding
              where superseding.supersedes_submission_id = submission.id)) then
          reasons := reasons || jsonb_build_array(jsonb_build_object(
            'code', 'domain_block', 'dimension', dimension_value));
        elsif exists (select 1 from public.catalog_review_submissions submission
          where submission.case_id = review_case.id
            and submission.dimension::text = dimension_value
            and submission.decision = 'Revise'
            and not exists (select 1 from public.catalog_review_submissions superseding
              where superseding.supersedes_submission_id = submission.id)) then
          reasons := reasons || jsonb_build_array(jsonb_build_object(
            'code', 'revision_required', 'dimension', dimension_value));
        else
          reasons := reasons || jsonb_build_array(jsonb_build_object(
            'code', 'insufficient_evidence', 'dimension', dimension_value));
        end if;
        continue;
      end if;

      select submission.* into effective_review
      from public.catalog_review_submissions submission
      join public.catalog_owner_adjudications adjudication
        on adjudication.selected_submission_id = submission.id
       and adjudication.case_id = review_case.id
       and adjudication.dimension::text = dimension_value
      where submission.case_id = review_case.id
        and submission.dimension::text = dimension_value
        and not exists (select 1 from public.catalog_review_submissions superseding
          where superseding.supersedes_submission_id = submission.id);
      if effective_review.id is null then
        if exists (select 1 from public.catalog_owner_adjudications adjudication
          where adjudication.case_id = review_case.id
            and adjudication.dimension::text = dimension_value) then
          reasons := reasons || jsonb_build_array(jsonb_build_object(
            'code', 'owner_adjudication_invalid', 'dimension', dimension_value));
        else
          reasons := reasons || jsonb_build_array(jsonb_build_object(
            'code', 'conflicting_qualified_reviews', 'dimension', dimension_value,
            'detail', 'owner_adjudication_missing'));
        end if;
        continue;
      end if;
    else
      select * into effective_review
      from public.catalog_review_submissions submission
      where submission.case_id = review_case.id
        and submission.dimension::text = dimension_value
        and not exists (
          select 1 from public.catalog_review_submissions superseding
          where superseding.supersedes_submission_id = submission.id
        )
      order by submission.submitted_at desc, submission.id desc
      limit 1;
    end if;

    select exists (
      select 1
      from public.catalog_reviewer_authority_dimensions authority_dimension
      join public.catalog_reviewer_authorities authority
        on authority.reference = authority_dimension.authority_reference
      where authority_dimension.authority_reference =
          effective_review.reviewer_authority_reference
        and authority_dimension.dimension::text = dimension_value
        and (authority.valid_from is null or authority.valid_from <= effective_review.reviewed_at)
        and (authority.valid_until is null or authority.valid_until >= effective_review.reviewed_at)
    ) into authority_covered;
    if not authority_covered then
      reasons := reasons || jsonb_build_array(jsonb_build_object(
        'code', 'missing_qualified_authority', 'dimension', dimension_value
      ));
    end if;

    select count(*) into evidence_count
    from public.catalog_review_submission_evidence evidence
    where evidence.submission_id = effective_review.id;
    if evidence_count = 0 then
      reasons := reasons || jsonb_build_array(jsonb_build_object(
        'code', 'missing_required_evidence', 'dimension', dimension_value
      ));
    end if;

    if effective_review.decision = 'Block' then
      reasons := reasons || jsonb_build_array(jsonb_build_object(
        'code', 'domain_block', 'dimension', dimension_value
      ));
    elsif effective_review.decision = 'Insufficient evidence' then
      reasons := reasons || jsonb_build_array(jsonb_build_object(
        'code', 'insufficient_evidence', 'dimension', dimension_value
      ));
    elsif effective_review.decision = 'Revise' then
      reasons := reasons || jsonb_build_array(jsonb_build_object(
        'code', 'revision_required', 'dimension', dimension_value
      ));
    elsif effective_review.decision not in ('Accept', 'Accept with clarification') then
      reasons := reasons || jsonb_build_array(jsonb_build_object(
        'code', 'review_not_accepted', 'dimension', dimension_value
      ));
    end if;

    if effective_review.follow_up_status in ('required', 'unresolved') then
      reasons := reasons || jsonb_build_array(jsonb_build_object(
        'code', 'unresolved_follow_up', 'dimension', dimension_value
      ));
    end if;
    if effective_review.decision = 'Accept with clarification'
      and effective_review.clarification_requires_catalog_change then
      reasons := reasons || jsonb_build_array(jsonb_build_object(
        'code', 'clarification_requires_catalog_change', 'dimension', dimension_value
      ));
    end if;
  end loop;

  return jsonb_build_object(
    'eligible', jsonb_array_length(reasons) = 0,
    'case_id', review_case.id,
    'revision_id', review_case.revision_id,
    'reason_codes', reasons
  );
end;
$$;

create or replace function public.transition_catalog_review_case(
  p_case_id text,
  p_target_status text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  review_case public.catalog_review_cases%rowtype;
  eligible_report jsonb;
  legal_transition boolean := false;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Review case transition requires a reason'
      using errcode = '22023';
  end if;

  select * into review_case
  from public.catalog_review_cases
  where id = p_case_id
  for update;
  if review_case.id is null then
    raise exception 'Unknown catalog review case'
      using errcode = '22023';
  end if;

  legal_transition :=
    (review_case.status::text = 'draft' and p_target_status = 'ready_for_review')
    or (review_case.status::text = 'ready_for_review' and p_target_status = 'in_review')
    or (review_case.status::text = 'in_review' and p_target_status in (
      'changes_requested', 'blocked', 'completed'
    ))
    or (review_case.status::text = 'changes_requested' and p_target_status in (
      'in_review', 'blocked'
    ))
    or (review_case.status::text = 'blocked' and p_target_status = 'in_review');

  if not legal_transition then
    raise exception 'Illegal catalog review case transition'
      using errcode = '22023';
  end if;

  if p_target_status = 'blocked'
    and not exists (
      select 1
      from public.catalog_review_submissions submission
      where submission.case_id = p_case_id
        and submission.decision in ('Block', 'Insufficient evidence')
    ) then
    raise exception 'Blocked status requires a domain block or insufficient evidence submission'
      using errcode = '22023';
  end if;

  if review_case.status::text = 'blocked' and p_target_status = 'in_review'
    and not exists (
      select 1
      from public.catalog_review_submissions submission
      where submission.case_id = p_case_id
        and submission.submitted_at > review_case.status_changed_at
    ) then
    raise exception 'Blocked review requires a later qualified submission'
      using errcode = '22023';
  end if;

  if p_target_status = 'completed' then
    eligible_report := public.get_catalog_review_eligibility(p_case_id);
    if coalesce((eligible_report->>'eligible')::boolean, false) = false then
      raise exception 'Review case is not eligible for completion: %', eligible_report->'reason_codes'
        using errcode = '22023';
    end if;
  end if;

  update public.catalog_review_cases
  set status = p_target_status::public.catalog_review_case_status,
      status_changed_at = now()
  where id = p_case_id;

  insert into public.catalog_review_case_events (
    case_id, from_status, to_status, reason
  ) values (
    p_case_id, review_case.status::text, p_target_status::public.catalog_review_case_status, p_reason
  );

  return jsonb_build_object(
    'case_id', p_case_id,
    'from_status', review_case.status,
    'to_status', p_target_status
  );
end;
$$;

revoke all on function public.register_catalog_reviewer_authority(
  text, text, text, text[], date, date
) from public, anon, authenticated;
revoke all on function public.create_catalog_review_case(text, text, text)
  from public, anon, authenticated;
revoke all on function public.submit_catalog_review(
  text, text, text, text, text, text, text, date, text, boolean, text,
  text, text, jsonb, jsonb, text
) from public, anon, authenticated;
revoke all on function public.record_catalog_review_evidence(
  text, text, text, text, text
) from public, anon, authenticated;
revoke all on function public.record_catalog_owner_adjudication(
  text, text, text, text, text, text, text
) from public, anon, authenticated;
revoke all on function public.get_catalog_review_eligibility(text)
  from public, anon, authenticated;
revoke all on function public.transition_catalog_review_case(text, text, text)
  from public, anon, authenticated;

grant execute on function public.register_catalog_reviewer_authority(
  text, text, text, text[], date, date
) to service_role;
grant execute on function public.create_catalog_review_case(text, text, text)
  to service_role;
grant execute on function public.submit_catalog_review(
  text, text, text, text, text, text, text, date, text, boolean, text,
  text, text, jsonb, jsonb, text
) to service_role;
grant execute on function public.record_catalog_review_evidence(
  text, text, text, text, text
) to service_role;
grant execute on function public.record_catalog_owner_adjudication(
  text, text, text, text, text, text, text
) to service_role;
grant execute on function public.get_catalog_review_eligibility(text)
  to service_role;
grant execute on function public.transition_catalog_review_case(text, text, text)
  to service_role;

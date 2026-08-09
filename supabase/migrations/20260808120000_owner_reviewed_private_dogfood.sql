alter table public.content_revisions
  add column review_standard text not null default 'qualified_external'
    check (review_standard in ('qualified_external', 'private_dogfood_owner'));

create table public.catalog_owner_approvals (
  revision_id text primary key references public.content_revisions(id)
    on delete restrict,
  review_standard text not null check (review_standard = 'private_dogfood_owner'),
  reviewer_role text not null check (reviewer_role = 'product_owner'),
  approval_reference_id text not null unique check (btrim(approval_reference_id) <> ''),
  reviewed_at date not null,
  approved_at date not null,
  next_review_at date not null check (next_review_at >= approved_at),
  recorded_at timestamptz not null default now()
);

alter table public.catalog_owner_approvals enable row level security;
revoke all on table public.catalog_owner_approvals
  from public, anon, authenticated, service_role;

create or replace function public.prevent_catalog_owner_approval_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Owner approvals are append-only'
    using errcode = '55000';
end;
$$;

create trigger catalog_owner_approvals_append_only
before update or delete on public.catalog_owner_approvals
for each row execute function public.prevent_catalog_owner_approval_changes();

alter table public.catalog_publications
  drop constraint catalog_publications_classification_check;
alter table public.catalog_publications
  add constraint catalog_publications_classification_check
  check (classification in ('production_candidate', 'private_dogfood_owner'));

create or replace function public.prevent_publication_standard_mismatch()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  revision_standard text;
begin
  select content_revisions.review_standard
    into revision_standard
  from public.content_revisions
  where content_revisions.id = new.revision_id;

  if new.classification = 'production_candidate'
    and revision_standard <> 'qualified_external' then
    raise exception 'Qualified publication requires qualified_external review standard'
      using errcode = '55000';
  end if;
  if new.classification = 'private_dogfood_owner'
    and revision_standard <> 'private_dogfood_owner' then
    raise exception 'Private publication requires private_dogfood_owner review standard'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger catalog_publications_review_standard_guard
before insert on public.catalog_publications
for each row execute function public.prevent_publication_standard_mismatch();

create or replace function public.approve_private_dogfood_revision(
  p_revision_id text,
  p_approval_reference_id text,
  p_reviewed_at date,
  p_approved_at date,
  p_next_review_at date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  revision_record public.content_revisions%rowtype;
  review_case public.catalog_review_cases%rowtype;
  existing_approval public.catalog_owner_approvals%rowtype;
begin
  perform public.lock_operational_control('content_publication');

  if p_revision_id is null or btrim(p_revision_id) = ''
    or p_approval_reference_id is null or btrim(p_approval_reference_id) = ''
    or p_reviewed_at is null or p_approved_at is null or p_next_review_at is null
    or p_next_review_at < p_approved_at
    or p_next_review_at < current_date then
    raise exception 'Private owner approval request is incomplete or overdue'
      using errcode = '22023';
  end if;

  select * into existing_approval
  from public.catalog_owner_approvals
  where revision_id = p_revision_id
  for update;
  if existing_approval.revision_id is not null then
    if existing_approval.approval_reference_id <> p_approval_reference_id
      or existing_approval.reviewed_at <> p_reviewed_at
      or existing_approval.approved_at <> p_approved_at
      or existing_approval.next_review_at <> p_next_review_at then
      raise exception 'Owner approval identifier is already bound to different proof'
        using errcode = '22023';
    end if;
    return jsonb_build_object(
      'approved', true,
      'replayed', true,
      'revision_id', existing_approval.revision_id,
      'review_standard', existing_approval.review_standard,
      'reviewer_role', existing_approval.reviewer_role
    );
  end if;

  select * into revision_record
  from public.content_revisions
  where id = p_revision_id
  for update;
  if revision_record.id is null or revision_record.status <> 'draft' then
    raise exception 'Private owner approval requires a draft revision'
      using errcode = '22023';
  end if;

  select * into review_case
  from public.catalog_review_cases
  where revision_id = p_revision_id
  for update;
  if review_case.id is null
    or review_case.classification <> 'production_candidate'
    or review_case.status not in ('draft', 'ready_for_review', 'in_review') then
    raise exception 'Private owner approval requires an open production candidate case'
      using errcode = '22023';
  end if;
  if exists (
    select 1 from public.catalog_review_submissions
    where case_id = review_case.id
  ) then
    raise exception 'Private owner approval cannot mix qualified review submissions'
      using errcode = '22023';
  end if;
  if exists (
    select 1 from public.catalog_publications
    where revision_id = p_revision_id
  ) then
    raise exception 'Private owner approval cannot follow publication'
      using errcode = '22023';
  end if;
  if not exists (select 1 from public.sources where id = revision_record.source_id)
    or not exists (
      select 1 from public.storage_rules where revision_id = p_revision_id
    )
    or not exists (
      select 1 from public.revision_catalog_metadata
      where revision_id = p_revision_id
    )
    or not exists (
      select 1 from public.revision_visual_requirements
      where revision_id = p_revision_id and requirement_declared
    )
    or not exists (
      select 1 from public.revision_tags
      join public.tags on tags.id = revision_tags.tag_id
      where revision_tags.revision_id = p_revision_id and tags.kind = 'skill'
    )
    or not exists (
      select 1 from public.revision_tags
      join public.tags on tags.id = revision_tags.tag_id
      where revision_tags.revision_id = p_revision_id and tags.kind = 'allergen'
    ) then
    raise exception 'Private owner approval requires complete source and catalog metadata'
      using errcode = '22023';
  end if;

  insert into public.catalog_owner_approvals (
    revision_id, review_standard, reviewer_role, approval_reference_id,
    reviewed_at, approved_at, next_review_at
  ) values (
    p_revision_id, 'private_dogfood_owner', 'product_owner',
    p_approval_reference_id, p_reviewed_at, p_approved_at, p_next_review_at
  );

  update public.catalog_review_cases
  set status = 'completed', status_changed_at = now()
  where id = review_case.id;
  insert into public.catalog_review_case_events (
    case_id, from_status, to_status, reason
  ) values (
    review_case.id, review_case.status, 'completed',
    'Private owner dogfood approval recorded'
  );

  return jsonb_build_object(
    'approved', true,
    'replayed', false,
    'revision_id', p_revision_id,
    'case_id', review_case.id,
    'review_standard', 'private_dogfood_owner',
    'reviewer_role', 'product_owner'
  );
end;
$$;

create or replace function public.publish_private_dogfood_revision(
  p_publication_id text,
  p_case_id text,
  p_release_owner_decision_reference text,
  p_source_validation_reference text,
  p_approved_at date,
  p_next_review_at date
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
  owner_approval public.catalog_owner_approvals%rowtype;
  existing_publication public.catalog_publications%rowtype;
begin
  perform public.lock_operational_control('content_publication');

  if p_publication_id is null
    or p_publication_id !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    or p_case_id is null
    or p_release_owner_decision_reference is null
    or btrim(p_release_owner_decision_reference) = ''
    or p_source_validation_reference is null
    or btrim(p_source_validation_reference) = ''
    or p_approved_at is null
    or p_next_review_at is null
    or p_next_review_at < p_approved_at
    or p_next_review_at < current_date then
    raise exception 'Private publication request is incomplete or overdue'
      using errcode = '22023';
  end if;

  select * into existing_publication
  from public.catalog_publications
  where id = p_publication_id
  for update;
  if existing_publication.id is not null then
    if existing_publication.case_id <> p_case_id
      or existing_publication.classification <> 'private_dogfood_owner'
      or existing_publication.release_owner_decision_reference <>
        p_release_owner_decision_reference
      or existing_publication.source_validation_reference <>
        p_source_validation_reference
      or existing_publication.approved_at <> p_approved_at
      or existing_publication.next_review_at <> p_next_review_at then
      raise exception 'Private publication identifier is already bound to different proof'
        using errcode = '22023';
    end if;
    return jsonb_build_object(
      'published', true,
      'replayed', true,
      'publication_id', existing_publication.id,
      'case_id', existing_publication.case_id,
      'revision_id', existing_publication.revision_id,
      'review_standard', 'private_dogfood_owner'
    );
  end if;

  select * into review_case
  from public.catalog_review_cases
  where id = p_case_id
  for update;
  select * into revision_record
  from public.content_revisions
  where id = review_case.revision_id
  for update;
  select * into preparation_record
  from public.preparations
  where id = revision_record.preparation_id
  for update;
  select * into owner_approval
  from public.catalog_owner_approvals
  where revision_id = revision_record.id;

  if review_case.id is null
    or review_case.status <> 'completed'
    or revision_record.id is null
    or revision_record.status <> 'draft'
    or owner_approval.revision_id is null
    or owner_approval.review_standard <> 'private_dogfood_owner'
    or preparation_record.id is null then
    raise exception 'Private owner revision is not approved and publishable'
      using errcode = '22023';
  end if;
  if owner_approval.approved_at <> p_approved_at
    or owner_approval.next_review_at <> p_next_review_at then
    raise exception 'Private publication dates must match owner approval'
      using errcode = '22023';
  end if;
  if preparation_record.is_active and not exists (
    select 1
    from public.catalog_publications prior_publication
    join public.content_revisions prior_revision
      on prior_revision.id = prior_publication.revision_id
    where prior_revision.preparation_id = revision_record.preparation_id
      and prior_revision.version < revision_record.version
      and prior_revision.status = 'approved'
  ) then
    raise exception 'Catalog preparation is active without a replaceable publication'
      using errcode = '22023';
  end if;
  if exists (
    select 1 from public.content_retirements
    where revision_id = revision_record.id
  ) then
    raise exception 'Catalog revision is retired'
      using errcode = '22023';
  end if;
  if not exists (select 1 from public.sources where id = revision_record.source_id)
    or not exists (
      select 1 from public.revision_catalog_metadata
      where revision_id = revision_record.id
    )
    or not exists (
      select 1 from public.revision_visual_requirements
      where revision_id = revision_record.id and requirement_declared
    )
    or not exists (
      select 1 from public.storage_rules where revision_id = revision_record.id
    ) then
    raise exception 'Private publication metadata is incomplete'
      using errcode = '22023';
  end if;

  update public.content_revisions
  set review_standard = 'private_dogfood_owner',
      reviewer_role = 'product_owner',
      reviewed_at = owner_approval.reviewed_at,
      status = 'approved',
      approved_at = p_approved_at,
      next_review_at = p_next_review_at
  where id = revision_record.id;

  insert into public.catalog_publications (
    id, case_id, revision_id, classification,
    effective_submission_ids, effective_approval_reference_ids,
    effective_adjudication_ids, release_owner_decision_reference,
    source_validation_reference, approved_at, next_review_at
  ) values (
    p_publication_id, review_case.id, revision_record.id,
    'private_dogfood_owner', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
    p_release_owner_decision_reference, p_source_validation_reference,
    p_approved_at, p_next_review_at
  );

  update public.preparations set is_active = true
  where id = preparation_record.id;
  return jsonb_build_object(
    'published', true,
    'replayed', false,
    'publication_id', p_publication_id,
    'case_id', review_case.id,
    'revision_id', revision_record.id,
    'review_standard', 'private_dogfood_owner'
  );
end;
$$;

alter function public.get_catalog_review_eligibility(text)
  rename to get_catalog_review_eligibility_unchecked;

create function public.get_catalog_review_eligibility(p_case_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  review_standard text;
begin
  select content_revisions.review_standard
    into review_standard
  from public.catalog_review_cases
  join public.content_revisions
    on content_revisions.id = catalog_review_cases.revision_id
  where catalog_review_cases.id = p_case_id;
  if review_standard = 'private_dogfood_owner'
    or exists (
      select 1
      from public.catalog_owner_approvals
      join public.catalog_review_cases
        on catalog_review_cases.revision_id = catalog_owner_approvals.revision_id
      where catalog_review_cases.id = p_case_id
        and catalog_owner_approvals.review_standard = 'private_dogfood_owner'
    ) then
    return jsonb_build_object(
      'eligible', false,
      'reason_codes', jsonb_build_array('private_dogfood_owner_not_external')
    );
  end if;
  return public.get_catalog_review_eligibility_unchecked(p_case_id);
end;
$$;

create or replace function public.current_published_preparations()
returns table (
  preparation_id text,
  food_id text,
  food_name text,
  preparation_slug text,
  revision_id text
)
language sql
stable
security definer
set search_path = ''
as $$
  with latest_publication as (
    select distinct on (preparations.id)
      preparations.id as preparation_id,
      preparations.food_id,
      foods.name as food_name,
      preparations.slug as preparation_slug,
      preparations.is_active,
      content_revisions.id as revision_id,
      content_revisions.status as revision_status,
      content_revisions.reviewer_role,
      content_revisions.review_standard,
      content_revisions.reviewed_at,
      content_revisions.approved_at as revision_approved_at,
      content_revisions.next_review_at as revision_next_review_at,
      content_revisions.source_id,
      review_case.classification as review_classification,
      review_case.status as review_status,
      publication.classification as publication_classification,
      publication.approved_at as publication_approved_at,
      publication.next_review_at as publication_next_review_at,
      publication.published_at
    from public.preparations
    join public.foods on foods.id = preparations.food_id
    join public.content_revisions
      on content_revisions.preparation_id = preparations.id
    join public.catalog_publications publication
      on publication.revision_id = content_revisions.id
    join public.catalog_review_cases review_case
      on review_case.id = publication.case_id
     and review_case.revision_id = content_revisions.id
    where (
      (
        content_revisions.review_standard = 'qualified_external'
        and review_case.classification = 'production_candidate'
        and publication.classification = 'production_candidate'
      )
      or (
        content_revisions.review_standard = 'private_dogfood_owner'
        and publication.classification = 'private_dogfood_owner'
        and auth.uid() is not null
      )
    )
    order by preparations.id, content_revisions.version desc,
      publication.published_at desc, publication.id desc
  )
  select latest_publication.preparation_id,
    latest_publication.food_id,
    latest_publication.food_name,
    latest_publication.preparation_slug,
    latest_publication.revision_id
  from latest_publication
  where latest_publication.is_active
    and latest_publication.revision_status = 'approved'
    and latest_publication.review_status = 'completed'
    and latest_publication.publication_approved_at =
      latest_publication.revision_approved_at
    and latest_publication.publication_next_review_at =
      latest_publication.revision_next_review_at
    and latest_publication.publication_next_review_at >= current_date
    and nullif(btrim(latest_publication.reviewer_role), '') is not null
    and latest_publication.reviewed_at is not null
    and latest_publication.revision_approved_at is not null
    and latest_publication.revision_next_review_at is not null
    and (
      (
        latest_publication.review_standard = 'qualified_external'
        and latest_publication.review_classification = 'production_candidate'
        and latest_publication.publication_classification = 'production_candidate'
      )
      or (
        latest_publication.review_standard = 'private_dogfood_owner'
        and latest_publication.publication_classification = 'private_dogfood_owner'
        and auth.uid() is not null
      )
    )
    and exists (
      select 1 from public.sources
      where sources.id = latest_publication.source_id
    )
    and not exists (
      select 1 from public.content_retirements
      where content_retirements.revision_id = latest_publication.revision_id
    )
    and exists (
      select 1 from public.revision_visual_requirements requirement
      where requirement.revision_id = latest_publication.revision_id
        and requirement.requirement_declared
        and (
          not requirement.visual_required
          or exists (
            select 1
            from public.revision_visuals association
            join public.catalog_visuals visual on visual.id = association.visual_id
            where association.revision_id = latest_publication.revision_id
          )
        )
    )
    and exists (
      select 1 from public.revision_tags
      join public.tags on tags.id = revision_tags.tag_id
      where revision_tags.revision_id = latest_publication.revision_id
        and tags.kind = 'skill'
    )
    and exists (
      select 1 from public.revision_tags
      join public.tags on tags.id = revision_tags.tag_id
      where revision_tags.revision_id = latest_publication.revision_id
        and tags.kind = 'allergen'
    )
    and exists (
      select 1 from public.storage_rules
      where storage_rules.revision_id = latest_publication.revision_id
    );
$$;

create or replace function public.list_published_catalog_items()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_baby_id uuid := public.active_baby_for_caller();
begin
  perform public.lock_operational_control('content_publication');
  return coalesce(
    (
      select jsonb_agg(item order by item->>'food_name', item->>'preparation_name')
      from (
        select jsonb_build_object(
          'slug', published.preparation_slug,
          'food_name', published.food_name,
          'preparation_name', preparations.name,
          'category', foods.category,
          'review_standard', content_revisions.review_standard,
          'preparation_time_band', revision_catalog_metadata.preparation_time_band,
          'familiarity',
            case
              when active_baby_id is null then 'unknown'
              else coalesce(
                (
                  select case
                    when baby_food_exposures.state in ('liked', 'neutral', 'disliked') then 'familiar'
                    when baby_food_exposures.state = 'not_tried' then 'new'
                    else 'unknown'
                  end
                  from public.baby_food_exposures
                  where baby_food_exposures.baby_id = active_baby_id
                    and baby_food_exposures.food_id = published.food_id
                ), 'unknown'
              )
            end,
          'skill_compatibility',
            case
              when active_baby_id is null then 'unknown'
              when not exists (
                select 1
                from public.revision_tags
                join public.tags on tags.id = revision_tags.tag_id
                left join public.baby_skills
                  on baby_skills.baby_id = active_baby_id
                  and baby_skills.skill_tag_id = tags.id
                where revision_tags.revision_id = published.revision_id
                  and tags.kind = 'skill'
                  and baby_skills.status is distinct from 'observed'
              ) then 'compatible'
              else 'not_confirmed'
            end,
          'storage_support_status',
            case when exists (
              select 1 from public.storage_rules
              where storage_rules.revision_id = published.revision_id
                and storage_rules.support_status = 'supported'
            ) then 'supported' else 'unsupported' end,
          'skill_labels', coalesce((
            select jsonb_agg(tags.label order by tags.label)
            from public.revision_tags
            join public.tags on tags.id = revision_tags.tag_id
            where revision_tags.revision_id = published.revision_id
              and tags.kind = 'skill'
          ), '[]'::jsonb),
          'allergen_labels', coalesce((
            select jsonb_agg(tags.label order by tags.label)
            from public.revision_tags
            join public.tags on tags.id = revision_tags.tag_id
            where revision_tags.revision_id = published.revision_id
              and tags.kind = 'allergen'
          ), '[]'::jsonb)
        ) as item
        from public.current_published_preparations() published
        join public.preparations on preparations.id = published.preparation_id
        join public.foods on foods.id = published.food_id
        join public.content_revisions on content_revisions.id = published.revision_id
        join public.revision_catalog_metadata
          on revision_catalog_metadata.revision_id = published.revision_id
      ) items
    ), '[]'::jsonb
  );
end;
$$;

create or replace function public.get_published_preparation_unchecked(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with published as (
    select
      current_publication.preparation_slug as slug,
      current_publication.food_name,
      preparations.name as preparation_name,
      foods.category,
      content_revisions.*
    from public.current_published_preparations() current_publication
    join public.preparations on preparations.id = current_publication.preparation_id
    join public.foods on foods.id = current_publication.food_id
    join public.content_revisions on content_revisions.id = current_publication.revision_id
    where current_publication.preparation_slug = p_slug
  )
  select jsonb_build_object(
    'slug', published.slug,
    'food_name', published.food_name,
    'category', published.category,
    'preparation_name', published.preparation_name,
    'revision_id', published.id,
    'version', published.version,
    'review_standard', published.review_standard,
    'method', published.method,
    'shape_texture', published.shape_texture,
    'reviewer_role', published.reviewer_role,
    'reviewed_at', published.reviewed_at,
    'approved_at', published.approved_at,
    'next_review_at', published.next_review_at,
    'source', (
      select jsonb_build_object(
        'publisher', sources.publisher, 'title', sources.title,
        'url', sources.url, 'source_date', sources.source_date,
        'accessed_at', sources.accessed_at
      ) from public.sources where sources.id = published.source_id
    ),
    'tags', (
      select coalesce(jsonb_agg(
        jsonb_build_object('kind', tags.kind, 'label', tags.label)
        order by tags.kind, tags.label
      ), '[]'::jsonb)
      from public.revision_tags
      join public.tags on tags.id = revision_tags.tag_id
      where revision_tags.revision_id = published.id
    ),
    'storage_rules', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'support_status', storage_rules.support_status,
          'deadline_kind', storage_rules.deadline_kind,
          'duration_hours', storage_rules.duration_hours,
          'guidance', storage_rules.guidance
        ) order by storage_rules.id
      ), '[]'::jsonb)
      from public.storage_rules
      where storage_rules.revision_id = published.id
    )
  ) from published;
$$;

grant select, insert on public.catalog_owner_approvals to catalog_publication_writer;
grant insert on public.catalog_review_case_events to catalog_publication_writer;
grant execute on function public.approve_private_dogfood_revision(
  text, text, date, date, date
) to service_role;
grant execute on function public.publish_private_dogfood_revision(
  text, text, text, text, date, date
) to service_role;
grant execute on function public.get_catalog_review_eligibility(text)
  to service_role, catalog_publication_writer;
revoke all on function public.get_catalog_review_eligibility(text)
  from public, anon, authenticated;
grant execute on function public.lock_operational_control(text)
  to catalog_publication_writer;
grant select, insert, update on public.catalog_publications
  to catalog_publication_writer;
grant update on public.content_revisions, public.preparations
  to catalog_publication_writer;
grant select on public.catalog_review_cases, public.content_revisions,
  public.preparations, public.sources, public.content_retirements,
  public.revision_visual_requirements, public.revision_visuals,
  public.catalog_visuals, public.revision_catalog_metadata,
  public.revision_tags, public.tags, public.storage_rules
  to catalog_publication_writer;

revoke all on function public.approve_private_dogfood_revision(
  text, text, date, date, date
) from public, anon, authenticated;
revoke all on function public.publish_private_dogfood_revision(
  text, text, text, text, date, date
) from public, anon, authenticated;
revoke all on function public.get_catalog_review_eligibility_unchecked(text)
  from public, anon, authenticated;
grant execute on function public.get_catalog_review_eligibility_unchecked(text)
  to catalog_publication_writer;

grant usage, create on schema public to catalog_publication_writer;
alter function public.publish_private_dogfood_revision(
  text, text, text, text, date, date
) owner to catalog_publication_writer;
revoke create on schema public from catalog_publication_writer;

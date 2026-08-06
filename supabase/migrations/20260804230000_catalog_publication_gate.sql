begin;

create table public.catalog_publications (
  id text primary key check (id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  case_id text not null unique
    references public.catalog_review_cases(id) on delete restrict,
  revision_id text not null unique
    references public.content_revisions(id) on delete restrict,
  classification text not null check (classification = 'production_candidate'),
  effective_submission_ids jsonb not null check (jsonb_typeof(effective_submission_ids) = 'array'),
  effective_approval_reference_ids jsonb not null check (jsonb_typeof(effective_approval_reference_ids) = 'array'),
  effective_adjudication_ids jsonb not null check (jsonb_typeof(effective_adjudication_ids) = 'array'),
  release_owner_decision_reference text not null
    check (char_length(btrim(release_owner_decision_reference)) between 1 and 512),
  source_validation_reference text not null
    check (char_length(btrim(source_validation_reference)) between 1 and 512),
  approved_at date not null,
  next_review_at date not null check (next_review_at >= approved_at),
  published_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_roles where rolname = 'catalog_publication_writer'
  ) then
    create role catalog_publication_writer noinherit nologin;
  end if;
end;
$$;

grant catalog_publication_writer to postgres;
alter role catalog_publication_writer with bypassrls;

alter table public.catalog_publications enable row level security;
revoke all on table public.catalog_publications
from public, anon, authenticated, service_role;
grant select on table public.catalog_publications to service_role;
grant select, insert, update on table public.catalog_publications
to catalog_publication_writer;

create policy catalog_publication_writer_select
on public.catalog_publications
for select to catalog_publication_writer
using (true);

create policy catalog_publication_writer_insert
on public.catalog_publications
for insert to catalog_publication_writer
with check (true);

create function public.prevent_catalog_publication_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Catalog publication proofs are immutable'
    using errcode = '55000';
end;
$$;

create trigger catalog_publications_append_only
before update or delete on public.catalog_publications
for each row execute function public.prevent_catalog_publication_changes();

create or replace function private.reject_locked_candidate_snapshot()
returns trigger
language plpgsql
security invoker
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

  if is_locked and current_user <> 'catalog_publication_writer' then
    raise exception 'candidate_snapshot_locked' using errcode = '55000';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.prevent_approved_reference_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  is_approved_reference boolean := false;
begin
  if tg_op = 'UPDATE' and new is not distinct from old then
    return new;
  end if;

  if tg_table_name = 'sources' then
    select exists (
      select 1
      from public.content_revisions
      where content_revisions.source_id = old.id
        and content_revisions.status = 'approved'
    ) into is_approved_reference;
  elsif tg_table_name = 'tags' then
    select exists (
      select 1
      from public.revision_tags
      join public.content_revisions
        on content_revisions.id = revision_tags.revision_id
      where revision_tags.tag_id = old.id
        and content_revisions.status = 'approved'
    ) into is_approved_reference;
  elsif tg_table_name = 'foods' then
    select exists (
      select 1
      from public.preparations
      join public.content_revisions
        on content_revisions.preparation_id = preparations.id
      where preparations.food_id = old.id
        and content_revisions.status = 'approved'
    ) into is_approved_reference;
  elsif tg_table_name = 'preparations' then
    select exists (
      select 1
      from public.content_revisions
      where content_revisions.preparation_id = old.id
        and content_revisions.status = 'approved'
    ) into is_approved_reference;
  end if;

  if is_approved_reference and current_user <> 'catalog_publication_writer' then
    raise exception 'Approved content references are append-only'
      using errcode = '55000';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.publish_catalog_review_case(
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
  existing_publication public.catalog_publications%rowtype;
  eligibility_report jsonb;
  effective_submission_ids jsonb;
  effective_approval_reference_ids jsonb;
  effective_adjudication_ids jsonb;
  effective_submission_count integer;
  covered_approval_count integer;
  effective_reviewer_role text;
  effective_reviewed_at date;
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
    or p_next_review_at is null then
    raise exception 'Publication request is incomplete'
      using errcode = '22023';
  end if;

  select * into existing_publication
  from public.catalog_publications
  where id = p_publication_id
  for update;

  if existing_publication.id is not null then
    if existing_publication.case_id <> p_case_id
      or existing_publication.release_owner_decision_reference <>
        p_release_owner_decision_reference
      or existing_publication.source_validation_reference <>
        p_source_validation_reference
      or existing_publication.approved_at <> p_approved_at
      or existing_publication.next_review_at <> p_next_review_at then
      raise exception 'Publication identifier is already bound to different proof'
        using errcode = '22023';
    end if;

    return jsonb_build_object(
      'published', true,
      'replayed', true,
      'publication_id', existing_publication.id,
      'case_id', existing_publication.case_id,
      'revision_id', existing_publication.revision_id
    );
  end if;

  select * into review_case
  from public.catalog_review_cases
  where id = p_case_id
  for update;
  if review_case.id is null then
    raise exception 'Unknown catalog review case'
      using errcode = '22023';
  end if;

  if exists (
    select 1 from public.catalog_publications
    where case_id = p_case_id
  ) then
    raise exception 'Catalog review case is already published'
      using errcode = '22023';
  end if;

  if review_case.classification <> 'production_candidate'
    or review_case.status <> 'completed' then
    raise exception 'Catalog review case is not completed and publishable'
      using errcode = '22023';
  end if;

  select * into revision_record
  from public.content_revisions
  where id = review_case.revision_id
  for update;
  select * into preparation_record
  from public.preparations
  where id = revision_record.preparation_id
  for update;

  if revision_record.id is null or preparation_record.id is null then
    raise exception 'Catalog review case has no stable catalog revision'
      using errcode = '22023';
  end if;
  if revision_record.status = 'approved' then
    raise exception 'Catalog revision is already published or active'
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
    select 1
    from public.content_retirements
    where content_retirements.revision_id = revision_record.id
  ) then
    raise exception 'Catalog revision is retired'
      using errcode = '22023';
  end if;
  if p_next_review_at < p_approved_at or p_next_review_at < current_date then
    raise exception 'Publication review date is overdue'
      using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.sources
    where id = revision_record.source_id
  ) then
    raise exception 'Publication source is unavailable'
      using errcode = '22023';
  end if;

  eligibility_report := public.get_catalog_review_eligibility(p_case_id);
  if coalesce((eligibility_report->>'eligible')::boolean, false) = false then
    raise exception 'Catalog review case is not eligible for publication: %',
      eligibility_report->'reason_codes'
      using errcode = '22023';
  end if;

  with current_tips as (
    select submission.*
    from public.catalog_review_submissions submission
    where submission.case_id = p_case_id
      and not exists (
        select 1
        from public.catalog_review_submissions successor
        where successor.supersedes_submission_id = submission.id
      )
  ),
  effective as (
    select tip.*
    from current_tips tip
    where (
      (select count(*) from current_tips same_dimension
       where same_dimension.dimension = tip.dimension) = 1
      or tip.id = (
        select adjudication.selected_submission_id
        from public.catalog_owner_adjudications adjudication
        where adjudication.case_id = p_case_id
          and adjudication.dimension = tip.dimension
          and not exists (
            select 1
            from public.catalog_owner_adjudications successor
            where successor.supersedes_adjudication_id = adjudication.id
          )
        order by adjudication.recorded_at desc, adjudication.id desc
        limit 1
      )
    )
  )
  select
    count(*)::integer,
    count(approval.submission_id)::integer,
    coalesce(jsonb_agg(effective.id order by effective.dimension, effective.id), '[]'::jsonb),
    coalesce(jsonb_agg(approval.approval_reference_id order by effective.dimension, effective.id)
      filter (where approval.submission_id is not null), '[]'::jsonb),
    max(effective.reviewed_at),
    string_agg(distinct effective.reviewer_role, '; ' order by effective.reviewer_role)
  into
    effective_submission_count,
    covered_approval_count,
    effective_submission_ids,
    effective_approval_reference_ids,
    effective_reviewed_at,
    effective_reviewer_role
  from effective
  left join public.catalog_review_submission_approval_references approval
    on approval.submission_id = effective.id;

  if effective_submission_count = 0
    or covered_approval_count <> effective_submission_count then
    raise exception 'Every effective qualified review requires an approval reference'
      using errcode = '22023';
  end if;

  select coalesce(
    jsonb_agg(adjudication.id order by adjudication.id),
    '[]'::jsonb
  )
  into effective_adjudication_ids
  from public.catalog_owner_adjudications adjudication
  where adjudication.case_id = p_case_id
    and not exists (
      select 1
      from public.catalog_owner_adjudications successor
      where successor.supersedes_adjudication_id = adjudication.id
    );

  insert into public.catalog_publications (
    id,
    case_id,
    revision_id,
    classification,
    effective_submission_ids,
    effective_approval_reference_ids,
    effective_adjudication_ids,
    release_owner_decision_reference,
    source_validation_reference,
    approved_at,
    next_review_at
  ) values (
    p_publication_id,
    p_case_id,
    revision_record.id,
    review_case.classification,
    effective_submission_ids,
    effective_approval_reference_ids,
    effective_adjudication_ids,
    p_release_owner_decision_reference,
    p_source_validation_reference,
    p_approved_at,
    p_next_review_at
  );

  update public.preparations
  set is_active = true
  where id = preparation_record.id;

  update public.content_revisions
  set status = 'approved',
      reviewer_role = effective_reviewer_role,
      reviewed_at = effective_reviewed_at,
      approved_at = p_approved_at,
      next_review_at = p_next_review_at
  where id = revision_record.id;

  return jsonb_build_object(
    'published', true,
    'replayed', false,
    'publication_id', p_publication_id,
    'case_id', p_case_id,
    'revision_id', revision_record.id
  );
end;
$$;

grant select on table public.catalog_review_cases,
  public.content_revisions,
  public.preparations,
  public.sources,
  public.content_retirements,
  public.catalog_review_submissions,
  public.catalog_review_submission_approval_references,
  public.catalog_owner_adjudications
  to catalog_publication_writer;
grant update on table public.content_revisions, public.preparations
  to catalog_publication_writer;
grant update on table public.catalog_review_cases
  to catalog_publication_writer;
grant usage, create on schema public to catalog_publication_writer;
grant usage on schema private to catalog_publication_writer;
grant usage on schema private to service_role;
grant execute on function public.lock_operational_control(text)
  to catalog_publication_writer;
grant execute on function public.get_catalog_review_eligibility(text)
  to catalog_publication_writer;
grant execute on function private.candidate_snapshot_locked(text)
  to catalog_publication_writer, service_role;
alter function public.publish_catalog_review_case(
  text, text, text, text, date, date
) owner to catalog_publication_writer;
revoke create on schema public from catalog_publication_writer;

revoke all on function public.publish_catalog_review_case(
  text, text, text, text, date, date
) from public, anon, authenticated;
grant execute on function public.publish_catalog_review_case(
  text, text, text, text, date, date
) to service_role;

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
      content_revisions.version as revision_version,
      content_revisions.reviewer_role,
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
    and latest_publication.review_classification = 'production_candidate'
    and latest_publication.review_status = 'completed'
    and latest_publication.publication_classification = 'production_candidate'
    and latest_publication.publication_approved_at =
      latest_publication.revision_approved_at
    and latest_publication.publication_next_review_at =
      latest_publication.revision_next_review_at
    and latest_publication.publication_next_review_at >= current_date
    and nullif(btrim(latest_publication.reviewer_role), '') is not null
    and latest_publication.reviewed_at is not null
    and latest_publication.revision_approved_at is not null
    and latest_publication.revision_next_review_at is not null
    and exists (
      select 1
      from public.sources
      where sources.id = latest_publication.source_id
    )
    and not exists (
      select 1
      from public.content_retirements
      where content_retirements.revision_id = latest_publication.revision_id
    )
    and exists (
      select 1
      from public.revision_visual_requirements requirement
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
      select 1
      from public.revision_tags
      join public.tags on tags.id = revision_tags.tag_id
      where revision_tags.revision_id = latest_publication.revision_id
        and tags.kind = 'skill'
    )
    and exists (
      select 1
      from public.revision_tags
      join public.tags on tags.id = revision_tags.tag_id
      where revision_tags.revision_id = latest_publication.revision_id
        and tags.kind = 'allergen'
    )
    and exists (
      select 1
      from public.storage_rules
      where storage_rules.revision_id = latest_publication.revision_id
    );
$$;

create or replace function public.list_published_preparations_unchecked()
returns table (
  slug text,
  food_name text,
  preparation_name text,
  storage_support_status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    published.preparation_slug,
    published.food_name,
    preparations.name,
    case
      when exists (
        select 1 from public.storage_rules
        where storage_rules.revision_id = published.revision_id
          and storage_rules.support_status = 'supported'
      ) then 'supported'
      else 'unsupported'
    end
  from public.current_published_preparations() published
  join public.preparations on preparations.id = published.preparation_id
  order by published.food_name, preparations.name;
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
    'method', published.method,
    'shape_texture', published.shape_texture,
    'reviewer_role', published.reviewer_role,
    'reviewed_at', published.reviewed_at,
    'approved_at', published.approved_at,
    'next_review_at', published.next_review_at,
    'source', (
      select jsonb_build_object(
        'publisher', sources.publisher,
        'title', sources.title,
        'url', sources.url,
        'source_date', sources.source_date,
        'accessed_at', sources.accessed_at
      )
      from public.sources where sources.id = published.source_id
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
  )
  from published;
$$;

commit;

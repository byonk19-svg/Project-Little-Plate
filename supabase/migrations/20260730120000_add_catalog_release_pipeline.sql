begin;

create table public.catalog_visuals (
  id text primary key,
  asset_reference text not null
    check (asset_reference ~ '^/[A-Za-z0-9]'),
  rights_basis text not null
    check (rights_basis in ('original', 'licensed')),
  rights_holder text not null check (btrim(rights_holder) <> ''),
  license_name text,
  license_url text,
  alt_text text not null
    check (char_length(btrim(alt_text)) >= 12),
  reviewed_at date not null,
  check (
    (
      rights_basis = 'original'
      and license_name is null
      and license_url is null
    )
    or (
      rights_basis = 'licensed'
      and nullif(btrim(license_name), '') is not null
      and nullif(btrim(license_url), '') is not null
      and license_url ~
        '^https://[A-Za-z0-9][A-Za-z0-9.-]*(:[0-9]{1,5})?(/[^[:space:]]*)?$'
    )
  )
);

create table public.revision_visual_requirements (
  revision_id text primary key
    references public.content_revisions(id) on delete restrict,
  requirement_declared boolean not null,
  visual_required boolean not null,
  check (requirement_declared or not visual_required)
);

create table public.revision_visuals (
  revision_id text not null
    references public.content_revisions(id) on delete restrict,
  visual_id text not null
    references public.catalog_visuals(id) on delete restrict,
  primary key (revision_id, visual_id)
);

create table public.revision_catalog_metadata (
  revision_id text primary key
    references public.content_revisions(id) on delete restrict,
  preparation_time_band text not null
    check (
      preparation_time_band in (
        'under_15_minutes',
        '15_to_30_minutes',
        'over_30_minutes'
      )
    )
);

alter table public.catalog_visuals enable row level security;
alter table public.revision_visual_requirements enable row level security;
alter table public.revision_visuals enable row level security;
alter table public.revision_catalog_metadata enable row level security;

revoke all on table public.catalog_visuals
  from public, anon, authenticated, service_role;
revoke all on table public.revision_visual_requirements
  from public, anon, authenticated, service_role;
revoke all on table public.revision_visuals
  from public, anon, authenticated, service_role;
revoke all on table public.revision_catalog_metadata
  from public, anon, authenticated, service_role;
grant select on table public.catalog_visuals to service_role;
grant select on table public.revision_visual_requirements to service_role;
grant select on table public.revision_visuals to service_role;
grant select on table public.revision_catalog_metadata to service_role;

create function public.prevent_catalog_visual_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Published visual records are append-only'
    using errcode = '55000';
end;
$$;

create trigger catalog_visuals_append_only
before update or delete on public.catalog_visuals
for each row execute function public.prevent_catalog_visual_changes();

create function public.prevent_approved_revision_catalog_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_revision_id text := coalesce(new.revision_id, old.revision_id);
begin
  if exists (
    select 1
    from public.content_revisions
    where content_revisions.id = target_revision_id
      and content_revisions.status = 'approved'
  ) then
    raise exception 'Approved revision catalog metadata is append-only'
      using errcode = '55000';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger revision_visual_requirements_approved_append_only
before insert or update or delete on public.revision_visual_requirements
for each row
execute function public.prevent_approved_revision_catalog_changes();

create trigger revision_visuals_approved_append_only
before insert or update or delete on public.revision_visuals
for each row
execute function public.prevent_approved_revision_catalog_changes();

create trigger revision_catalog_metadata_approved_append_only
before insert or update or delete on public.revision_catalog_metadata
for each row
execute function public.prevent_approved_revision_catalog_changes();

alter function public.import_catalog_fixture(jsonb)
  rename to import_catalog_fixture_unchecked;

revoke all on function public.import_catalog_fixture_unchecked(jsonb)
  from public, anon, authenticated, service_role;

create function public.import_catalog_fixture(p_fixture jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  visual_record jsonb;
  revision_record jsonb;
  visual_id text;
  existing_visual public.catalog_visuals%rowtype;
  existing_requirement public.revision_visual_requirements%rowtype;
  existing_status text;
  existing_visual_ids jsonb;
  incoming_visual_ids jsonb;
  existing_preparation_time_band text;
  preparation_time_band text;
  desired_status text;
  requirement_declared boolean;
  visual_required boolean;
  visual_ids jsonb;
  staged_fixture jsonb;
  result jsonb;
begin
  if p_fixture is null then
    raise exception 'Catalog fixture is required'
      using errcode = '22023';
  end if;

  for revision_record in
    select value from jsonb_array_elements(p_fixture->'revisions')
  loop
    desired_status := revision_record->>'status';
    if desired_status = 'approved'
      and (
        not revision_record ? 'visual_required'
        or jsonb_typeof(revision_record->'visual_required') <> 'boolean'
      ) then
      raise exception 'Approved revision requires an explicit visual requirement'
        using errcode = '22023';
    end if;
    if desired_status = 'approved'
      and (
        nullif(btrim(revision_record->>'reviewer_role'), '') is null
        or nullif(revision_record->>'reviewed_at', '') is null
        or nullif(revision_record->>'approved_at', '') is null
        or nullif(revision_record->>'next_review_at', '') is null
      ) then
      raise exception 'Approved revision requires complete review metadata'
        using errcode = '22023';
    end if;
    if desired_status = 'approved'
      and not revision_record ? 'preparation_time_band' then
      raise exception 'Approved revision requires a preparation-time band'
        using errcode = '22023';
    end if;
    if revision_record ? 'preparation_time_band'
      and coalesce(revision_record->>'preparation_time_band', '') not in (
        'under_15_minutes',
        '15_to_30_minutes',
        'over_30_minutes'
      ) then
      raise exception 'Revision contains an invalid preparation-time band'
        using errcode = '22023';
    end if;
    if desired_status = 'approved'
      and not exists (
        select 1
        from public.content_revisions
        where content_revisions.id = revision_record->>'id'
          and content_revisions.status = 'approved'
      )
      and (revision_record->>'next_review_at')::date < current_date then
      raise exception 'Approved revision is overdue for new publication'
        using errcode = '22023';
    end if;
  end loop;

  if p_fixture ? 'visuals'
    and jsonb_typeof(p_fixture->'visuals') <> 'array' then
    raise exception 'Catalog visuals must be an array'
      using errcode = '22023';
  end if;

  select jsonb_set(
    p_fixture,
    '{revisions}',
    coalesce(
      jsonb_agg(
        case
          when revision.value->>'status' = 'approved'
            and not exists (
              select 1
              from public.content_revisions
              where content_revisions.id = revision.value->>'id'
                and content_revisions.status = 'approved'
            )
          then jsonb_set(
            revision.value,
            '{status}',
            to_jsonb('in_review'::text)
          )
          else revision.value
        end
        order by revision.ordinality
      ),
      '[]'::jsonb
    )
  )
    into staged_fixture
  from jsonb_array_elements(p_fixture->'revisions')
    with ordinality as revision(value, ordinality);

  staged_fixture := jsonb_set(
    staged_fixture,
    '{retirements}',
    '[]'::jsonb
  );

  result := public.import_catalog_fixture_unchecked(staged_fixture);

  for visual_record in
    select value
    from jsonb_array_elements(coalesce(p_fixture->'visuals', '[]'::jsonb))
  loop
    if nullif(btrim(visual_record->>'id'), '') is null
      or coalesce(visual_record->>'asset_reference', '') !~ '^/[A-Za-z0-9]'
      or coalesce(visual_record->>'rights_basis', '') not in (
        'original',
        'licensed'
      )
      or nullif(btrim(visual_record->>'rights_holder'), '') is null
      or char_length(btrim(coalesce(visual_record->>'alt_text', ''))) < 12
      or nullif(visual_record->>'reviewed_at', '') is null
      or (
        visual_record->>'rights_basis' = 'original'
        and (
          nullif(btrim(visual_record->>'license_name'), '') is not null
          or nullif(btrim(visual_record->>'license_url'), '') is not null
        )
      )
      or (
        visual_record->>'rights_basis' = 'licensed'
        and (
          nullif(btrim(visual_record->>'license_name'), '') is null
          or coalesce(visual_record->>'license_url', '') !~
            '^https://[A-Za-z0-9][A-Za-z0-9.-]*(:[0-9]{1,5})?(/[^[:space:]]*)?$'
        )
      ) then
      raise exception 'Visual requires complete rights and alt-text metadata'
        using errcode = '22023';
    end if;

    select catalog_visuals.*
      into existing_visual
    from public.catalog_visuals
    where catalog_visuals.id = visual_record->>'id';

    if existing_visual.id is not null then
      if existing_visual.asset_reference <> visual_record->>'asset_reference'
        or existing_visual.rights_basis <> visual_record->>'rights_basis'
        or existing_visual.rights_holder <> visual_record->>'rights_holder'
        or existing_visual.license_name is distinct from
          nullif(visual_record->>'license_name', '')
        or existing_visual.license_url is distinct from
          nullif(visual_record->>'license_url', '')
        or existing_visual.alt_text <> visual_record->>'alt_text'
        or existing_visual.reviewed_at <>
          (visual_record->>'reviewed_at')::date then
        raise exception 'Visual identifiers cannot be reused with different data'
          using errcode = '22023';
      end if;
      continue;
    end if;

    insert into public.catalog_visuals (
      id,
      asset_reference,
      rights_basis,
      rights_holder,
      license_name,
      license_url,
      alt_text,
      reviewed_at
    )
    values (
      visual_record->>'id',
      visual_record->>'asset_reference',
      visual_record->>'rights_basis',
      visual_record->>'rights_holder',
      nullif(visual_record->>'license_name', ''),
      nullif(visual_record->>'license_url', ''),
      visual_record->>'alt_text',
      (visual_record->>'reviewed_at')::date
    );
  end loop;

  for revision_record in
    select value from jsonb_array_elements(p_fixture->'revisions')
  loop
    requirement_declared := revision_record ? 'visual_required';
    visual_required := coalesce(
      (revision_record->>'visual_required')::boolean,
      false
    );
    visual_ids := coalesce(revision_record->'visual_ids', '[]'::jsonb);
    preparation_time_band :=
      nullif(revision_record->>'preparation_time_band', '');

    if jsonb_typeof(visual_ids) <> 'array' then
      raise exception 'Revision visual identifiers must be an array'
        using errcode = '22023';
    end if;
    if visual_required and jsonb_array_length(visual_ids) = 0 then
      raise exception 'Required visual is missing'
        using errcode = '22023';
    end if;

    select coalesce(
      jsonb_agg(
        incoming.requested_visual_id
        order by incoming.requested_visual_id
      ),
      '[]'::jsonb
    )
      into incoming_visual_ids
    from (
      select value as requested_visual_id
      from jsonb_array_elements_text(visual_ids)
    ) as incoming;

    if jsonb_array_length(incoming_visual_ids)
      <> (
        select count(distinct value)
        from jsonb_array_elements_text(visual_ids)
      ) then
      raise exception 'Revision visual identifiers must be unique'
        using errcode = '22023';
    end if;

    if exists (
      select 1
      from jsonb_array_elements_text(visual_ids) as requested(visual_id)
      left join public.catalog_visuals
        on catalog_visuals.id = requested.visual_id
      where catalog_visuals.id is null
    ) then
      raise exception 'Revision contains an unknown visual reference'
        using errcode = '22023';
    end if;

    select content_revisions.status
      into existing_status
    from public.content_revisions
    where content_revisions.id = revision_record->>'id';

    select revision_catalog_metadata.preparation_time_band
      into existing_preparation_time_band
    from public.revision_catalog_metadata
    where revision_catalog_metadata.revision_id = revision_record->>'id';

    select revision_visual_requirements.*
      into existing_requirement
    from public.revision_visual_requirements
    where revision_visual_requirements.revision_id = revision_record->>'id';

    select coalesce(
      jsonb_agg(revision_visuals.visual_id order by revision_visuals.visual_id),
      '[]'::jsonb
    )
      into existing_visual_ids
    from public.revision_visuals
    where revision_visuals.revision_id = revision_record->>'id';

    if existing_status = 'approved' then
      if existing_preparation_time_band is distinct from
        preparation_time_band then
        raise exception 'Approved preparation-time band cannot be rewritten'
          using errcode = '22023';
      end if;

      if existing_requirement.revision_id is null
        or existing_requirement.requirement_declared
          <> requirement_declared
        or existing_requirement.visual_required <> visual_required then
        raise exception 'Approved visual requirement cannot be rewritten'
          using errcode = '22023';
      end if;

      if existing_visual_ids is distinct from incoming_visual_ids then
        raise exception 'Approved visual associations cannot be rewritten'
          using errcode = '22023';
      end if;

      continue;
    end if;

    delete from public.revision_catalog_metadata
    where revision_catalog_metadata.revision_id = revision_record->>'id';

    if preparation_time_band is not null then
      insert into public.revision_catalog_metadata (
        revision_id,
        preparation_time_band
      )
      values (
        revision_record->>'id',
        preparation_time_band
      );
    end if;

    delete from public.revision_visuals
    where revision_visuals.revision_id = revision_record->>'id';

    delete from public.revision_visual_requirements
    where revision_visual_requirements.revision_id = revision_record->>'id';

    insert into public.revision_visual_requirements (
      revision_id,
      requirement_declared,
      visual_required
    )
    values (
      revision_record->>'id',
      requirement_declared,
      visual_required
    );

    for visual_id in
      select value from jsonb_array_elements_text(visual_ids)
    loop
      insert into public.revision_visuals (revision_id, visual_id)
      values (revision_record->>'id', visual_id);
    end loop;
  end loop;

  result := public.import_catalog_fixture_unchecked(p_fixture);

  return result || jsonb_build_object(
    'visuals', (select count(*) from public.catalog_visuals)
  );
end;
$$;

revoke all on function public.import_catalog_fixture(jsonb)
  from public, anon, authenticated;
grant execute on function public.import_catalog_fixture(jsonb)
  to service_role;

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
  select distinct on (preparations.id)
    preparations.id,
    preparations.food_id,
    foods.name,
    preparations.slug,
    content_revisions.id
  from public.preparations
  join public.foods on foods.id = preparations.food_id
  join public.content_revisions
    on content_revisions.preparation_id = preparations.id
  where preparations.is_active
    and content_revisions.status = 'approved'
    and nullif(btrim(content_revisions.reviewer_role), '') is not null
    and content_revisions.reviewed_at is not null
    and content_revisions.approved_at is not null
    and content_revisions.next_review_at is not null
    and exists (
      select 1
      from public.revision_visual_requirements
      where revision_visual_requirements.revision_id = content_revisions.id
        and revision_visual_requirements.requirement_declared
    )
    and exists (
      select 1
      from public.revision_catalog_metadata
      where revision_catalog_metadata.revision_id = content_revisions.id
    )
    and not exists (
      select 1
      from public.content_retirements
      where content_retirements.revision_id = content_revisions.id
    )
    and exists (
      select 1
      from public.revision_tags
      join public.tags on tags.id = revision_tags.tag_id
      where revision_tags.revision_id = content_revisions.id
        and tags.kind = 'skill'
    )
    and exists (
      select 1
      from public.revision_tags
      join public.tags on tags.id = revision_tags.tag_id
      where revision_tags.revision_id = content_revisions.id
        and tags.kind = 'allergen'
    )
    and exists (
      select 1
      from public.storage_rules
      where storage_rules.revision_id = content_revisions.id
    )
  order by preparations.id, content_revisions.version desc;
$$;

create function public.get_catalog_release_report(
  p_as_of date default current_date
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  with latest_approved as (
    select distinct on (preparations.id)
      content_revisions.id as revision_id,
      content_revisions.source_id,
      content_revisions.next_review_at,
      content_revisions.version,
      preparations.id as preparation_id,
      preparations.food_id
    from public.content_revisions
    join public.preparations
      on preparations.id = content_revisions.preparation_id
    where preparations.is_active
      and content_revisions.status = 'approved'
      and nullif(btrim(content_revisions.reviewer_role), '') is not null
      and content_revisions.reviewed_at is not null
      and content_revisions.approved_at is not null
      and content_revisions.next_review_at is not null
      and not exists (
        select 1
        from public.content_retirements
        where content_retirements.revision_id = content_revisions.id
      )
    order by preparations.id, content_revisions.version desc
  ),
  approved_candidates as (
    select latest_approved.*
    from latest_approved
    where exists (
        select 1
        from public.revision_tags
        join public.tags on tags.id = revision_tags.tag_id
        where revision_tags.revision_id = latest_approved.revision_id
          and tags.kind = 'skill'
      )
      and exists (
        select 1
        from public.revision_tags
        join public.tags on tags.id = revision_tags.tag_id
        where revision_tags.revision_id = latest_approved.revision_id
          and tags.kind = 'allergen'
      )
      and exists (
        select 1
        from public.storage_rules
        where storage_rules.revision_id = latest_approved.revision_id
      )
  ),
  eligible as (
    select distinct approved_candidates.food_id
    from approved_candidates
    join public.revision_visual_requirements
      on revision_visual_requirements.revision_id =
        approved_candidates.revision_id
      and revision_visual_requirements.requirement_declared
    join public.revision_catalog_metadata
      on revision_catalog_metadata.revision_id =
        approved_candidates.revision_id
    where approved_candidates.next_review_at >= p_as_of
      and (
        not revision_visual_requirements.visual_required
        or exists (
          select 1
          from public.revision_visuals
          where revision_visuals.revision_id =
            approved_candidates.revision_id
        )
      )
  ),
  overdue as (
    select coalesce(
      jsonb_agg(
        approved_candidates.revision_id
        order by approved_candidates.revision_id
      ),
      '[]'::jsonb
    ) as ids
    from approved_candidates
    where approved_candidates.next_review_at < p_as_of
  ),
  undeclared_visuals as (
    select coalesce(
      jsonb_agg(
        approved_candidates.revision_id
        order by approved_candidates.revision_id
      ),
      '[]'::jsonb
    ) as ids
    from approved_candidates
    left join public.revision_visual_requirements
      on revision_visual_requirements.revision_id =
        approved_candidates.revision_id
    where coalesce(
      revision_visual_requirements.requirement_declared,
      false
    ) = false
  )
  select jsonb_build_object(
    'as_of', p_as_of,
    'structural_candidate_food_count', (select count(*) from eligible),
    'structural_target_minimum', 40,
    'structural_target_maximum', 60,
    'structural_target_shape_met',
      (select count(*) from eligible) between 40 and 60,
    'beta_ready', false,
    'external_approval_status', 'not_recorded',
    'overdue_revision_ids', overdue.ids,
    'visual_requirement_missing_revision_ids', undeclared_visuals.ids,
    'structural_candidate_source_count', (
      select count(distinct approved_candidates.source_id)
      from approved_candidates
      join public.revision_visual_requirements
        on revision_visual_requirements.revision_id =
          approved_candidates.revision_id
        and revision_visual_requirements.requirement_declared
      join public.revision_catalog_metadata
        on revision_catalog_metadata.revision_id =
          approved_candidates.revision_id
    )
  )
  from overdue, undeclared_visuals;
$$;

revoke all on function public.get_catalog_release_report(date)
  from public, anon, authenticated;
grant execute on function public.get_catalog_release_report(date)
  to service_role;

create function public.list_catalog_release_sources()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', candidate_sources.id,
        'url', candidate_sources.url
      )
      order by candidate_sources.id
    ),
    '[]'::jsonb
  )
  from (
    select distinct sources.id, sources.url
    from public.current_published_preparations() as published
    join public.content_revisions
      on content_revisions.id = published.revision_id
    join public.sources on sources.id = content_revisions.source_id
  ) as candidate_sources;
$$;

revoke all on function public.list_catalog_release_sources()
  from public, anon, authenticated;
grant execute on function public.list_catalog_release_sources()
  to service_role;

create or replace function public.get_published_preparation(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
  published_revision_id text;
  preparation_time_band text;
begin
  perform public.lock_operational_control('content_publication');
  result := public.get_published_preparation_unchecked(p_slug);
  published_revision_id := result->>'revision_id';
  select revision_catalog_metadata.preparation_time_band
    into preparation_time_band
  from public.revision_catalog_metadata
  where revision_catalog_metadata.revision_id = published_revision_id;

  if result is null
    or preparation_time_band is null
    or not exists (
    select 1
    from public.revision_visual_requirements
    where revision_visual_requirements.revision_id = published_revision_id
      and revision_visual_requirements.requirement_declared
  ) then
    return null;
  end if;

  return result || jsonb_build_object(
    'preparation_time_band', preparation_time_band,
    'visuals',
    (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'asset_reference', catalog_visuals.asset_reference,
            'rights_basis', catalog_visuals.rights_basis,
            'rights_holder', catalog_visuals.rights_holder,
            'license_name', catalog_visuals.license_name,
            'license_url', catalog_visuals.license_url,
            'alt_text', catalog_visuals.alt_text,
            'reviewed_at', catalog_visuals.reviewed_at
          )
          order by catalog_visuals.id
        ),
        '[]'::jsonb
      )
      from public.revision_visuals
      join public.catalog_visuals
        on catalog_visuals.id = revision_visuals.visual_id
      where revision_visuals.revision_id = published_revision_id
    )
  );
end;
$$;

create function public.list_published_catalog_items()
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
          'preparation_time_band',
            revision_catalog_metadata.preparation_time_band,
          'familiarity',
            case
              when active_baby_id is null then 'unknown'
              else coalesce(
                (
                  select case
                    when baby_food_exposures.state in (
                      'liked',
                      'neutral',
                      'disliked'
                    ) then 'familiar'
                    when baby_food_exposures.state = 'not_tried' then 'new'
                    else 'unknown'
                  end
                  from public.baby_food_exposures
                  where baby_food_exposures.baby_id = active_baby_id
                    and baby_food_exposures.food_id = published.food_id
                ),
                'unknown'
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
            case
              when exists (
                select 1
                from public.storage_rules
                where storage_rules.revision_id = published.revision_id
                  and storage_rules.support_status = 'supported'
              ) then 'supported'
              else 'unsupported'
            end,
          'skill_labels',
            coalesce(
              (
                select jsonb_agg(tags.label order by tags.label)
                from public.revision_tags
                join public.tags on tags.id = revision_tags.tag_id
                where revision_tags.revision_id = published.revision_id
                  and tags.kind = 'skill'
              ),
              '[]'::jsonb
            ),
          'allergen_labels',
            coalesce(
              (
                select jsonb_agg(tags.label order by tags.label)
                from public.revision_tags
                join public.tags on tags.id = revision_tags.tag_id
                where revision_tags.revision_id = published.revision_id
                  and tags.kind = 'allergen'
              ),
              '[]'::jsonb
            )
        ) as item
        from public.current_published_preparations() as published
        join public.preparations
          on preparations.id = published.preparation_id
        join public.foods on foods.id = published.food_id
        join public.revision_catalog_metadata
          on revision_catalog_metadata.revision_id = published.revision_id
      ) as items
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.list_published_catalog_items()
  from public, anon, authenticated;
grant execute on function public.list_published_catalog_items()
  to anon, authenticated;

commit;

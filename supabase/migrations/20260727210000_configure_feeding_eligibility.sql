create table public.baby_skills (
  baby_id uuid not null references public.babies (id) on delete cascade,
  skill_tag_id text not null references public.tags (id),
  status text not null
    check (status in ('observed', 'not_observed', 'not_sure')),
  updated_at timestamptz not null default now(),
  primary key (baby_id, skill_tag_id)
);

create table public.baby_food_restrictions (
  baby_id uuid not null references public.babies (id) on delete cascade,
  food_id text not null references public.foods (id),
  status text not null
    check (
      status in (
        'no_known_restriction',
        'confirmed_allergy',
        'directed_exclusion',
        'temporary_avoidance',
        'reaction_reported'
      )
    ),
  updated_at timestamptz not null default now(),
  primary key (baby_id, food_id)
);

create table public.baby_food_exposures (
  baby_id uuid not null references public.babies (id) on delete cascade,
  food_id text not null references public.foods (id),
  state text not null
    check (
      state in (
        'liked',
        'neutral',
        'disliked',
        'not_tried',
        'skipped',
        'unknown'
      )
    ),
  updated_at timestamptz not null default now(),
  primary key (baby_id, food_id)
);

create table public.baby_planning_preferences (
  baby_id uuid primary key references public.babies (id) on delete cascade,
  new_food_pace text not null
    check (
      new_food_pace in (
        'no_new_foods',
        'one_per_week',
        'two_per_week',
        'three_per_week'
      )
    ),
  preparation_time text not null
    check (
      preparation_time in (
        'under_15_minutes',
        'under_30_minutes',
        'flexible'
      )
    ),
  prep_day smallint check (prep_day between 0 and 6),
  updated_at timestamptz not null default now()
);

create table public.quick_backups (
  baby_id uuid not null references public.babies (id) on delete cascade,
  food_id text not null references public.foods (id),
  created_at timestamptz not null default now(),
  primary key (baby_id, food_id)
);

alter table public.baby_skills enable row level security;
alter table public.baby_food_restrictions enable row level security;
alter table public.baby_food_exposures enable row level security;
alter table public.baby_planning_preferences enable row level security;
alter table public.quick_backups enable row level security;

create policy "Caregivers can read their baby's skill observations"
  on public.baby_skills
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.babies
      join public.user_profiles
        on user_profiles.household_id = babies.household_id
      where babies.id = baby_skills.baby_id
        and user_profiles.user_id = (select auth.uid())
    )
  );

create policy "Caregivers can read their baby's food restrictions"
  on public.baby_food_restrictions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.babies
      join public.user_profiles
        on user_profiles.household_id = babies.household_id
      where babies.id = baby_food_restrictions.baby_id
        and user_profiles.user_id = (select auth.uid())
    )
  );

create policy "Caregivers can read their baby's food exposures"
  on public.baby_food_exposures
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.babies
      join public.user_profiles
        on user_profiles.household_id = babies.household_id
      where babies.id = baby_food_exposures.baby_id
        and user_profiles.user_id = (select auth.uid())
    )
  );

create policy "Caregivers can read their baby's planning preferences"
  on public.baby_planning_preferences
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.babies
      join public.user_profiles
        on user_profiles.household_id = babies.household_id
      where babies.id = baby_planning_preferences.baby_id
        and user_profiles.user_id = (select auth.uid())
    )
  );

create policy "Caregivers can read their baby's quick backups"
  on public.quick_backups
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.babies
      join public.user_profiles
        on user_profiles.household_id = babies.household_id
      where babies.id = quick_backups.baby_id
        and user_profiles.user_id = (select auth.uid())
    )
  );

revoke all on table public.baby_skills from public, anon, authenticated;
revoke all
  on table public.baby_food_restrictions
  from public, anon, authenticated;
revoke all on table public.baby_food_exposures from public, anon, authenticated;
revoke all
  on table public.baby_planning_preferences
  from public, anon, authenticated;
revoke all on table public.quick_backups from public, anon, authenticated;

grant select on table public.baby_skills to authenticated;
grant select on table public.baby_food_restrictions to authenticated;
grant select on table public.baby_food_exposures to authenticated;
grant select on table public.baby_planning_preferences to authenticated;
grant select on table public.quick_backups to authenticated;

grant select, insert, update, delete on table public.baby_skills to service_role;
grant select, insert, update, delete
  on table public.baby_food_restrictions to service_role;
grant select, insert, update, delete
  on table public.baby_food_exposures to service_role;
grant select, insert, update, delete
  on table public.baby_planning_preferences to service_role;
grant select, insert, update, delete on table public.quick_backups to service_role;

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
    and content_revisions.reviewer_role is not null
    and content_revisions.reviewed_at is not null
    and content_revisions.approved_at is not null
    and content_revisions.next_review_at is not null
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

create or replace function public.list_published_preparations()
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
        select 1
        from public.storage_rules
        where storage_rules.revision_id = published.revision_id
          and storage_rules.support_status = 'supported'
      ) then 'supported'
      else 'unsupported'
    end
  from public.current_published_preparations() as published
  join public.preparations
    on preparations.id = published.preparation_id
  order by published.food_name, preparations.name;
$$;

create or replace function public.get_published_preparation(p_slug text)
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
    from public.current_published_preparations() as current_publication
    join public.preparations
      on preparations.id = current_publication.preparation_id
    join public.foods on foods.id = current_publication.food_id
    join public.content_revisions
      on content_revisions.id = current_publication.revision_id
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
      from public.sources
      where sources.id = published.source_id
    ),
    'tags', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'kind', tags.kind,
            'label', tags.label
          )
          order by tags.kind, tags.label
        ),
        '[]'::jsonb
      )
      from public.revision_tags
      join public.tags on tags.id = revision_tags.tag_id
      where revision_tags.revision_id = published.id
    ),
    'storage_rules', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'support_status', storage_rules.support_status,
            'deadline_kind', storage_rules.deadline_kind,
            'duration_hours', storage_rules.duration_hours,
            'guidance', storage_rules.guidance
          )
          order by storage_rules.id
        ),
        '[]'::jsonb
      )
      from public.storage_rules
      where storage_rules.revision_id = published.id
    )
  )
  from published;
$$;

create or replace function public.current_published_foods()
returns table (
  food_id text,
  food_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    published.food_id,
    min(published.food_name) as food_name
  from public.current_published_preparations() as published
  group by published.food_id
  order by min(published.food_name), published.food_id;
$$;

create or replace function public.feeding_exposure_food_options()
returns table (
  food_id text,
  food_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select published_foods.food_id, published_foods.food_name
  from public.current_published_foods() as published_foods
  order by published_foods.food_name, published_foods.food_id
  limit 15;
$$;

create or replace function public.active_baby_for_caller()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select babies.id
  from public.babies
  join public.user_profiles
    on user_profiles.household_id = babies.household_id
  where user_profiles.user_id = (select auth.uid())
    and babies.is_active
  limit 1;
$$;

create or replace function public.save_feeding_configuration(
  p_skill_statuses jsonb,
  p_restrictions jsonb,
  p_exposures jsonb,
  p_new_food_pace text,
  p_preparation_time text,
  p_prep_day smallint,
  p_quick_backup_food_ids text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  active_baby_id uuid;
  skill_record jsonb;
  restriction_record jsonb;
  exposure_record jsonb;
  quick_backup_food_id text;
begin
  if caller_id is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  active_baby_id := public.active_baby_for_caller();
  if active_baby_id is null then
    raise exception 'An active baby profile is required'
      using errcode = '55000';
  end if;

  perform 1
  from public.babies
  where babies.id = active_baby_id
  for update;

  if jsonb_typeof(p_skill_statuses) <> 'array'
    or jsonb_typeof(p_restrictions) <> 'array'
    or jsonb_typeof(p_exposures) <> 'array' then
    raise exception 'Feeding configuration collections must be arrays'
      using errcode = '22023';
  end if;

  if jsonb_array_length(p_exposures) > 15 then
    raise exception 'Exposure setup supports no more than 15 foods'
      using errcode = '22023';
  end if;

  if cardinality(p_quick_backup_food_ids) > 8 then
    raise exception 'Choose no more than eight quick backups'
      using errcode = '22023';
  end if;

  if p_new_food_pace not in (
    'no_new_foods',
    'one_per_week',
    'two_per_week',
    'three_per_week'
  ) then
    raise exception 'New-food pace is invalid'
      using errcode = '22023';
  end if;

  if p_preparation_time not in (
    'under_15_minutes',
    'under_30_minutes',
    'flexible'
  ) then
    raise exception 'Preparation-time preference is invalid'
      using errcode = '22023';
  end if;

  if p_prep_day is not null and p_prep_day not between 0 and 6 then
    raise exception 'Prep day is invalid'
      using errcode = '22023';
  end if;

  if (
    select count(*)
    from jsonb_array_elements(p_skill_statuses)
  ) <> (
    select count(distinct value->>'skill_id')
    from jsonb_array_elements(p_skill_statuses)
  ) then
    raise exception 'Feeding abilities must be unique'
      using errcode = '22023';
  end if;

  if (
    select count(*)
    from jsonb_array_elements(p_restrictions)
  ) <> (
    select count(distinct value->>'food_id')
    from jsonb_array_elements(p_restrictions)
  ) then
    raise exception 'Food restrictions must be unique'
      using errcode = '22023';
  end if;

  if (
    select count(*)
    from jsonb_array_elements(p_exposures)
  ) <> (
    select count(distinct value->>'food_id')
    from jsonb_array_elements(p_exposures)
  ) then
    raise exception 'Exposure states must be unique'
      using errcode = '22023';
  end if;

  if cardinality(p_quick_backup_food_ids) <> (
    select count(distinct food_id)
    from unnest(p_quick_backup_food_ids) as food_id
  ) then
    raise exception 'Quick backups must be unique'
      using errcode = '22023';
  end if;

  for skill_record in
    select value from jsonb_array_elements(p_skill_statuses)
  loop
    if skill_record->>'status' not in (
      'observed',
      'not_observed',
      'not_sure'
    ) or not exists (
      select 1
      from public.current_published_preparations() as published
      join public.revision_tags
        on revision_tags.revision_id = published.revision_id
      join public.tags on tags.id = revision_tags.tag_id
      where tags.kind = 'skill'
        and tags.id = skill_record->>'skill_id'
    ) then
      raise exception 'Every ability must reference a supported reviewed ability'
        using errcode = '22023';
    end if;
  end loop;

  for restriction_record in
    select value from jsonb_array_elements(p_restrictions)
  loop
    if restriction_record->>'status' not in (
      'no_known_restriction',
      'confirmed_allergy',
      'directed_exclusion',
      'temporary_avoidance'
    ) or not exists (
      select 1
      from public.current_published_foods() as food_options
      where food_options.food_id = restriction_record->>'food_id'
    ) then
      raise exception 'Every restriction must reference a supported reviewed food'
        using errcode = '22023';
    end if;

    if exists (
      select 1
      from public.baby_food_restrictions
      where baby_food_restrictions.baby_id = active_baby_id
        and baby_food_restrictions.food_id = restriction_record->>'food_id'
        and baby_food_restrictions.status = 'reaction_reported'
    ) then
      raise exception 'Reaction-reported status requires an explicit resolution'
        using errcode = '55000';
    end if;
  end loop;

  for exposure_record in
    select value from jsonb_array_elements(p_exposures)
  loop
    if exposure_record->>'state' not in (
      'liked',
      'neutral',
      'disliked',
      'not_tried',
      'skipped',
      'unknown'
    ) or not exists (
      select 1
      from public.feeding_exposure_food_options() as food_options
      where food_options.food_id = exposure_record->>'food_id'
    ) then
      raise exception 'Every exposure must reference a supported reviewed food'
        using errcode = '22023';
    end if;
  end loop;

  foreach quick_backup_food_id in array p_quick_backup_food_ids
  loop
    if not exists (
      select 1
      from public.current_published_foods() as food_options
      where food_options.food_id = quick_backup_food_id
    ) then
      raise exception 'Every quick backup must reference a supported reviewed food'
        using errcode = '22023';
    end if;
  end loop;

  delete from public.baby_skills
  where baby_skills.baby_id = active_baby_id;

  insert into public.baby_skills (baby_id, skill_tag_id, status)
  select
    active_baby_id,
    value->>'skill_id',
    value->>'status'
  from jsonb_array_elements(p_skill_statuses);

  delete from public.baby_food_restrictions
  where baby_food_restrictions.baby_id = active_baby_id
    and baby_food_restrictions.status <> 'reaction_reported';

  insert into public.baby_food_restrictions (baby_id, food_id, status)
  select
    active_baby_id,
    value->>'food_id',
    value->>'status'
  from jsonb_array_elements(p_restrictions);

  delete from public.baby_food_exposures
  where baby_food_exposures.baby_id = active_baby_id
    and exists (
      select 1
      from public.feeding_exposure_food_options() as exposure_options
      where exposure_options.food_id = baby_food_exposures.food_id
    );

  insert into public.baby_food_exposures (baby_id, food_id, state)
  select
    active_baby_id,
    value->>'food_id',
    value->>'state'
  from jsonb_array_elements(p_exposures);

  insert into public.baby_planning_preferences (
    baby_id,
    new_food_pace,
    preparation_time,
    prep_day
  )
  values (
    active_baby_id,
    p_new_food_pace,
    p_preparation_time,
    p_prep_day
  )
  on conflict (baby_id) do update
    set new_food_pace = excluded.new_food_pace,
        preparation_time = excluded.preparation_time,
        prep_day = excluded.prep_day,
        updated_at = now();

  delete from public.quick_backups
  where quick_backups.baby_id = active_baby_id;

  insert into public.quick_backups (baby_id, food_id)
  select active_baby_id, food_id
  from unnest(p_quick_backup_food_ids) as food_id;

  return active_baby_id;
end;
$$;

create or replace function public.get_feeding_configuration()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  active_baby_id uuid;
begin
  if caller_id is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  active_baby_id := public.active_baby_for_caller();
  if active_baby_id is null then
    raise exception 'An active baby profile is required'
      using errcode = '55000';
  end if;

  return jsonb_build_object(
    'skills',
    (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', skill_options.id,
            'label', skill_options.label,
            'status', baby_skills.status
          )
          order by skill_options.label, skill_options.id
        ),
        '[]'::jsonb
      )
      from (
        select distinct tags.id, tags.label
        from public.current_published_preparations() as published
        join public.revision_tags
          on revision_tags.revision_id = published.revision_id
        join public.tags on tags.id = revision_tags.tag_id
        where tags.kind = 'skill'
      ) as skill_options
      left join public.baby_skills
        on baby_skills.baby_id = active_baby_id
        and baby_skills.skill_tag_id = skill_options.id
    ),
    'foods',
    (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', food_options.food_id,
            'name', food_options.food_name,
            'restriction_status', restrictions.status,
            'exposure_state', exposures.state,
            'exposure_selectable', exists (
              select 1
              from public.feeding_exposure_food_options() as exposure_options
              where exposure_options.food_id = food_options.food_id
            ),
            'is_quick_backup', quick_backups.food_id is not null
          )
          order by food_options.food_name, food_options.food_id
        ),
        '[]'::jsonb
      )
      from public.current_published_foods() as food_options
      left join public.baby_food_restrictions as restrictions
        on restrictions.baby_id = active_baby_id
        and restrictions.food_id = food_options.food_id
      left join public.baby_food_exposures as exposures
        on exposures.baby_id = active_baby_id
        and exposures.food_id = food_options.food_id
      left join public.quick_backups
        on quick_backups.baby_id = active_baby_id
        and quick_backups.food_id = food_options.food_id
    ),
    'preferences',
    (
      select jsonb_build_object(
        'new_food_pace', preferences.new_food_pace,
        'preparation_time', preferences.preparation_time,
        'prep_day', preferences.prep_day
      )
      from public.baby_planning_preferences as preferences
      where preferences.baby_id = active_baby_id
    )
  );
end;
$$;

create or replace function public.get_preparation_eligibility(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  active_baby_id uuid;
  published_preparation record;
  restriction_status text;
begin
  if caller_id is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  active_baby_id := public.active_baby_for_caller();
  if active_baby_id is null then
    return jsonb_build_object(
      'status', 'unsupported',
      'reason', 'profile_unavailable'
    );
  end if;

  select *
    into published_preparation
  from public.current_published_preparations() as published
  where published.preparation_slug = p_slug;

  if published_preparation.preparation_id is null then
    return jsonb_build_object(
      'status', 'unsupported',
      'reason', 'preparation_not_approved'
    );
  end if;

  select restrictions.status
    into restriction_status
  from public.baby_food_restrictions as restrictions
  where restrictions.baby_id = active_baby_id
    and restrictions.food_id = published_preparation.food_id;

  if restriction_status is null then
    return jsonb_build_object(
      'status', 'ineligible',
      'reason', 'restriction_status_unknown'
    );
  end if;

  if restriction_status in (
    'confirmed_allergy',
    'directed_exclusion',
    'temporary_avoidance',
    'reaction_reported'
  ) then
    return jsonb_build_object(
      'status', 'ineligible',
      'reason', 'food_restricted'
    );
  end if;

  if exists (
    select 1
    from public.revision_tags
    join public.tags on tags.id = revision_tags.tag_id
    left join public.baby_skills
      on baby_skills.baby_id = active_baby_id
      and baby_skills.skill_tag_id = tags.id
    where revision_tags.revision_id = published_preparation.revision_id
      and tags.kind = 'skill'
      and baby_skills.status is distinct from 'observed'
  ) then
    return jsonb_build_object(
      'status', 'ineligible',
      'reason', 'required_ability_not_observed'
    );
  end if;

  return jsonb_build_object('status', 'eligible');
end;
$$;

revoke all on function public.current_published_preparations()
  from public, anon, authenticated;
revoke all on function public.current_published_foods()
  from public, anon, authenticated;
revoke all on function public.feeding_exposure_food_options()
  from public, anon, authenticated;
revoke all on function public.active_baby_for_caller()
  from public, anon, authenticated;
revoke all on function public.save_feeding_configuration(
  jsonb,
  jsonb,
  jsonb,
  text,
  text,
  smallint,
  text[]
) from public, anon;
revoke all on function public.get_feeding_configuration()
  from public, anon;
revoke all on function public.get_preparation_eligibility(text)
  from public, anon;

grant execute on function public.save_feeding_configuration(
  jsonb,
  jsonb,
  jsonb,
  text,
  text,
  smallint,
  text[]
) to authenticated;
grant execute on function public.get_feeding_configuration()
  to authenticated;
grant execute on function public.get_preparation_eligibility(text)
  to authenticated;

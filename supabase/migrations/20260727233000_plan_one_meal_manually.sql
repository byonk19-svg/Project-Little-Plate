alter table public.content_revisions
  add constraint content_revisions_id_preparation_id_key
  unique (id, preparation_id);

create table public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  baby_id uuid not null unique references public.babies (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.meals (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.meal_plans (id) on delete cascade,
  local_date date not null,
  meal_slot text not null
    check (meal_slot in ('breakfast', 'lunch', 'dinner')),
  created_at timestamptz not null default now(),
  unique (plan_id, local_date, meal_slot)
);

create table public.meal_components (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references public.meals (id) on delete cascade,
  preparation_id text not null references public.preparations (id),
  revision_id text not null,
  position smallint not null check (position between 1 and 3),
  created_at timestamptz not null default now(),
  unique (meal_id, position),
  unique (meal_id, preparation_id),
  foreign key (revision_id, preparation_id)
    references public.content_revisions (id, preparation_id)
);

create index meals_local_date_idx on public.meals (local_date);
create index meal_components_revision_id_idx
  on public.meal_components (revision_id);

alter table public.meal_plans enable row level security;
alter table public.meals enable row level security;
alter table public.meal_components enable row level security;

create policy "Caregivers can read their baby's meal plan"
  on public.meal_plans
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.babies
      join public.user_profiles
        on user_profiles.household_id = babies.household_id
      where babies.id = meal_plans.baby_id
        and user_profiles.user_id = (select auth.uid())
    )
  );

create policy "Caregivers can read their baby's meals"
  on public.meals
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.meal_plans
      join public.babies on babies.id = meal_plans.baby_id
      join public.user_profiles
        on user_profiles.household_id = babies.household_id
      where meal_plans.id = meals.plan_id
        and user_profiles.user_id = (select auth.uid())
    )
  );

create policy "Caregivers can read their baby's meal components"
  on public.meal_components
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.meals
      join public.meal_plans on meal_plans.id = meals.plan_id
      join public.babies on babies.id = meal_plans.baby_id
      join public.user_profiles
        on user_profiles.household_id = babies.household_id
      where meals.id = meal_components.meal_id
        and user_profiles.user_id = (select auth.uid())
    )
  );

revoke all on table public.meal_plans from public, anon, authenticated;
revoke all on table public.meals from public, anon, authenticated;
revoke all on table public.meal_components from public, anon, authenticated;

grant select on table public.meal_plans to authenticated;
grant select on table public.meals to authenticated;
grant select on table public.meal_components to authenticated;

grant select, insert, update, delete on table public.meal_plans to service_role;
grant select, insert, update, delete on table public.meals to service_role;
grant select, insert, update, delete
  on table public.meal_components to service_role;

create or replace function public.tomorrow_in_time_zone(
  p_instant timestamptz,
  p_time_zone text
)
returns date
language sql
stable
set search_path = ''
as $$
  select ((p_instant at time zone p_time_zone)::date + 1);
$$;

create or replace function public.get_current_week(
  p_reference_at timestamptz default statement_timestamp()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  active_baby public.babies%rowtype;
  current_plan_id uuid;
  window_start date;
begin
  if caller_id is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  select babies.*
    into active_baby
  from public.babies
  join public.user_profiles
    on user_profiles.household_id = babies.household_id
  where user_profiles.user_id = caller_id
    and babies.is_active
  limit 1;

  if active_baby.id is null then
    return jsonb_build_object(
      'status', 'unavailable',
      'reason', 'profile_unavailable'
    );
  end if;

  window_start := (p_reference_at at time zone active_baby.time_zone)::date;

  select meal_plans.id
    into current_plan_id
  from public.meal_plans
  where meal_plans.baby_id = active_baby.id;

  return jsonb_build_object(
    'status', 'ready',
    'baby_id', active_baby.id,
    'time_zone', active_baby.time_zone,
    'window_start', window_start,
    'window_end', window_start + 6,
    'days',
    (
      select jsonb_agg(
        jsonb_build_object(
          'local_date', day.local_date,
          'slots',
          (
            select jsonb_agg(
              jsonb_build_object(
                'meal_slot', configured_slot.meal_slot,
                'components',
                coalesce(
                  (
                    select jsonb_agg(
                      jsonb_build_object(
                        'component_id', meal_components.id,
                        'position', meal_components.position,
                        'preparation_id', meal_components.preparation_id,
                        'revision_id', meal_components.revision_id,
                        'preparation_slug', preparations.slug,
                        'preparation_name', preparations.name,
                        'food_name', foods.name
                      )
                      order by meal_components.position
                    )
                    from public.meals
                    join public.meal_components
                      on meal_components.meal_id = meals.id
                    join public.preparations
                      on preparations.id = meal_components.preparation_id
                    join public.foods on foods.id = preparations.food_id
                    where meals.plan_id = current_plan_id
                      and meals.local_date = day.local_date
                      and meals.meal_slot = configured_slot.meal_slot
                  ),
                  '[]'::jsonb
                )
              )
              order by configured_slot.ordinality
            )
            from unnest(active_baby.meal_slots)
              with ordinality as configured_slot(meal_slot, ordinality)
          )
        )
        order by day.local_date
      )
      from (
        select window_start + offsets.day_offset as local_date
        from generate_series(0, 6) as offsets(day_offset)
      ) as day
    )
  );
end;
$$;

create or replace function public.plan_preparation_for_tomorrow(
  p_baby_id uuid,
  p_preparation_slug text,
  p_meal_slot text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  active_baby public.babies%rowtype;
  eligibility jsonb;
  published_preparation record;
  selected_revision_id text;
  target_local_date date;
  target_plan_id uuid;
  target_meal_id uuid;
  existing_component public.meal_components%rowtype;
  component_count integer;
  inserted_component_id uuid;
begin
  if caller_id is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  select babies.*
    into active_baby
  from public.babies
  join public.user_profiles
    on user_profiles.household_id = babies.household_id
  where babies.id = p_baby_id
    and babies.is_active
    and user_profiles.user_id = caller_id
  for update of babies;

  if active_baby.id is null then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'baby_not_accessible'
    );
  end if;

  if p_meal_slot is null
    or not p_meal_slot = any(active_baby.meal_slots) then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'meal_slot_not_configured'
    );
  end if;

  eligibility := public.get_preparation_eligibility(p_preparation_slug);
  if eligibility->>'status' <> 'eligible' then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', coalesce(eligibility->>'reason', 'eligibility_unavailable')
    );
  end if;

  select published.*
    into published_preparation
  from public.current_published_preparations() as published
  where published.preparation_slug = p_preparation_slug;

  if published_preparation.preparation_id is null then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'preparation_not_approved'
    );
  end if;

  selected_revision_id := published_preparation.revision_id;

  perform 1
  from public.content_revisions
  where content_revisions.id = selected_revision_id
  for update;

  eligibility := public.get_preparation_eligibility(p_preparation_slug);
  if eligibility->>'status' <> 'eligible' then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', coalesce(eligibility->>'reason', 'eligibility_unavailable')
    );
  end if;

  select published.*
    into published_preparation
  from public.current_published_preparations() as published
  where published.preparation_slug = p_preparation_slug
    and published.revision_id = selected_revision_id;

  if published_preparation.preparation_id is null then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'preparation_not_approved'
    );
  end if;

  target_local_date := public.tomorrow_in_time_zone(
    statement_timestamp(),
    active_baby.time_zone
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      active_baby.id::text
        || ':' || target_local_date::text
        || ':' || p_meal_slot,
      0
    )
  );

  insert into public.meal_plans (baby_id)
  values (active_baby.id)
  on conflict (baby_id) do nothing;

  select meal_plans.id
    into target_plan_id
  from public.meal_plans
  where meal_plans.baby_id = active_baby.id;

  insert into public.meals (plan_id, local_date, meal_slot)
  values (target_plan_id, target_local_date, p_meal_slot)
  on conflict (plan_id, local_date, meal_slot) do nothing;

  select meals.id
    into target_meal_id
  from public.meals
  where meals.plan_id = target_plan_id
    and meals.local_date = target_local_date
    and meals.meal_slot = p_meal_slot
  for update;

  select meal_components.*
    into existing_component
  from public.meal_components
  where meal_components.meal_id = target_meal_id
    and meal_components.preparation_id =
      published_preparation.preparation_id;

  if existing_component.id is not null then
    return jsonb_build_object(
      'status', 'planned',
      'component_id', existing_component.id,
      'local_date', target_local_date,
      'meal_slot', p_meal_slot,
      'preparation_id', existing_component.preparation_id,
      'revision_id', existing_component.revision_id
    );
  end if;

  select count(*)
    into component_count
  from public.meal_components
  where meal_components.meal_id = target_meal_id;

  if component_count >= 3 then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'meal_component_limit_reached'
    );
  end if;

  insert into public.meal_components (
    meal_id,
    preparation_id,
    revision_id,
    position
  )
  values (
    target_meal_id,
    published_preparation.preparation_id,
    published_preparation.revision_id,
    component_count + 1
  )
  returning meal_components.id into inserted_component_id;

  return jsonb_build_object(
    'status', 'planned',
    'component_id', inserted_component_id,
    'local_date', target_local_date,
    'meal_slot', p_meal_slot,
    'preparation_id', published_preparation.preparation_id,
    'revision_id', published_preparation.revision_id
  );
end;
$$;

revoke all on function public.tomorrow_in_time_zone(timestamptz, text)
  from public, anon, authenticated;
revoke all on function public.get_current_week(timestamptz)
  from public, anon;
revoke all on function public.plan_preparation_for_tomorrow(uuid, text, text)
  from public, anon;

grant execute on function public.tomorrow_in_time_zone(timestamptz, text)
  to service_role;
grant execute on function public.get_current_week(timestamptz)
  to authenticated;
grant execute
  on function public.plan_preparation_for_tomorrow(uuid, text, text)
  to authenticated;

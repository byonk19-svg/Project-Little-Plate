alter table public.meal_plans
  add column version bigint not null default 0
    check (version >= 0);

alter table public.meals
  add column status text not null default 'planned'
    check (status in ('planned', 'skipped', 'completed')),
  add column is_locked boolean not null default false;

alter table public.meal_components
  add column is_locked boolean not null default false;

create table public.meal_edit_events (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null
    references public.meal_plans (id) on delete cascade,
  version bigint not null check (version > 0),
  operation text not null
    check (
      operation in (
        'add_component',
        'delete_component',
        'set_component_lock',
        'set_meal_lock',
        'swap_component',
        'swap_meal',
        'use_quick_backup',
        'copy_meal',
        'set_meal_status',
        'undo_last_swap'
      )
    ),
  payload jsonb not null,
  before_state jsonb,
  after_state jsonb,
  result jsonb not null,
  actor_user_id uuid not null,
  occurred_at timestamptz not null default now(),
  idempotency_key uuid not null unique,
  compensates_event_id uuid references public.meal_edit_events (id),
  unique (plan_id, version)
);

create index meal_edit_events_plan_occurred_idx
  on public.meal_edit_events (plan_id, occurred_at desc);

alter table public.meal_edit_events enable row level security;

create policy "Caregivers can read their baby's meal edit history"
  on public.meal_edit_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.meal_plans
      join public.babies on babies.id = meal_plans.baby_id
      join public.user_profiles
        on user_profiles.household_id = babies.household_id
      where meal_plans.id = meal_edit_events.plan_id
        and user_profiles.user_id = (select auth.uid())
    )
  );

revoke all on table public.meal_edit_events
  from public, anon, authenticated;
grant select on table public.meal_edit_events to authenticated;
grant select, insert on table public.meal_edit_events to service_role;

create or replace function public.try_uuid(p_value text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_value::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

create or replace function public.try_date(p_value text)
returns date
language plpgsql
stable
set search_path = ''
as $$
begin
  return p_value::date;
exception
  when invalid_datetime_format or datetime_field_overflow then
    return null;
end;
$$;

create or replace function public.manual_meal_state(p_meal_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when meals.id is null then null
    else jsonb_build_object(
      'meal_id', meals.id,
      'local_date', meals.local_date,
      'meal_slot', meals.meal_slot,
      'status', meals.status,
      'is_locked', meals.is_locked,
      'components', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'component_id', meal_components.id,
              'position', meal_components.position,
              'preparation_id', meal_components.preparation_id,
              'revision_id', meal_components.revision_id,
              'preparation_slug', preparations.slug,
              'is_locked', meal_components.is_locked
            )
            order by meal_components.position
          )
          from public.meal_components
          join public.preparations
            on preparations.id = meal_components.preparation_id
          where meal_components.meal_id = meals.id
        ),
        '[]'::jsonb
      )
    )
  end
  from public.meals
  where meals.id = p_meal_id;
$$;

create or replace function public.resolve_week_preparation(
  p_baby_id uuid,
  p_preparation_slug text,
  p_require_quick_backup boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  eligibility jsonb;
  published record;
  locked_revision_id text;
begin
  if p_preparation_slug is null or p_preparation_slug = '' then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'preparation_required'
    );
  end if;

  eligibility := public.get_preparation_eligibility(
    p_preparation_slug
  );
  if eligibility->>'status' <> 'eligible' then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', coalesce(
        eligibility->>'reason',
        'eligibility_unavailable'
      )
    );
  end if;

  select current.*, preparations.name as preparation_name
    into published
  from public.current_published_preparations() as current
  join public.preparations
    on preparations.id = current.preparation_id
  where current.preparation_slug = p_preparation_slug;

  if published.preparation_id is null then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'preparation_not_approved'
    );
  end if;

  select content_revisions.id
    into locked_revision_id
  from public.content_revisions
  where content_revisions.id = published.revision_id
  for update;

  if locked_revision_id is null then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'preparation_not_approved'
    );
  end if;

  eligibility := public.get_preparation_eligibility(
    p_preparation_slug
  );
  if eligibility->>'status' <> 'eligible' then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', coalesce(
        eligibility->>'reason',
        'eligibility_unavailable'
      )
    );
  end if;

  select current.*, preparations.name as preparation_name
    into published
  from public.current_published_preparations() as current
  join public.preparations
    on preparations.id = current.preparation_id
  where current.preparation_slug = p_preparation_slug
    and current.revision_id = locked_revision_id;

  if published.preparation_id is null then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'preparation_not_approved'
    );
  end if;

  if p_require_quick_backup and not exists (
    select 1
    from public.quick_backups
    where quick_backups.baby_id = p_baby_id
      and quick_backups.food_id = published.food_id
  ) then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'quick_backup_unavailable'
    );
  end if;

  return jsonb_build_object(
    'status', 'eligible',
    'preparation_id', published.preparation_id,
    'revision_id', published.revision_id,
    'preparation_slug', published.preparation_slug,
    'preparation_name', published.preparation_name,
    'food_id', published.food_id,
    'food_name', published.food_name,
    'is_quick_backup', exists (
      select 1
      from public.quick_backups
      where quick_backups.baby_id = p_baby_id
        and quick_backups.food_id = published.food_id
    )
  );
end;
$$;

create or replace function public.get_week_window(
  p_window_start date default null
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
  current_plan public.meal_plans%rowtype;
  window_start date;
  planned_meals integer;
  distinct_foods integer;
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
  where babies.is_active
    and user_profiles.user_id = caller_id
  limit 1;

  if active_baby.id is null then
    return jsonb_build_object(
      'status', 'unavailable',
      'reason', 'profile_unavailable'
    );
  end if;

  window_start := coalesce(
    p_window_start,
    (statement_timestamp()
      at time zone active_baby.time_zone)::date
  );

  if window_start < current_date - 3660
    or window_start > current_date + 3660 then
    return jsonb_build_object(
      'status', 'unavailable',
      'reason', 'window_out_of_range'
    );
  end if;

  select meal_plans.*
    into current_plan
  from public.meal_plans
  where meal_plans.baby_id = active_baby.id;

  select
    count(distinct meals.id),
    count(distinct preparations.food_id)
    into planned_meals, distinct_foods
  from public.meals
  join public.meal_components
    on meal_components.meal_id = meals.id
  join public.preparations
    on preparations.id = meal_components.preparation_id
  where meals.plan_id = current_plan.id
    and meals.status = 'planned'
    and meals.local_date between window_start and window_start + 6;

  return jsonb_build_object(
    'status', 'ready',
    'baby_id', active_baby.id,
    'plan_id', current_plan.id,
    'version', coalesce(current_plan.version, 0),
    'time_zone', active_baby.time_zone,
    'window_start', window_start,
    'window_end', window_start + 6,
    'variety_summary', jsonb_build_object(
      'planned_meals', coalesce(planned_meals, 0),
      'distinct_foods', coalesce(distinct_foods, 0),
      'copy', case
        when coalesce(planned_meals, 0) = 0 then
          'Plan a few reviewed foods when you are ready.'
        when coalesce(distinct_foods, 0) = 1 then
          'This window keeps one reviewed food familiar across '
            || planned_meals || ' '
            || case when planned_meals = 1 then 'meal.' else 'meals.' end
        else
          'This window includes ' || distinct_foods
            || ' reviewed foods across ' || planned_meals || ' meals.'
      end
    ),
    'days', (
      select jsonb_agg(
        jsonb_build_object(
          'local_date', day.local_date,
          'slots', (
            select jsonb_agg(
              jsonb_build_object(
                'meal_id', meal.id,
                'meal_slot', configured.meal_slot,
                'status', coalesce(meal.status, 'planned'),
                'is_locked', coalesce(meal.is_locked, false),
                'components', coalesce(
                  (
                    select jsonb_agg(
                      jsonb_build_object(
                        'component_id', meal_components.id,
                        'position', meal_components.position,
                        'preparation_id',
                          meal_components.preparation_id,
                        'revision_id', meal_components.revision_id,
                        'preparation_slug', preparations.slug,
                        'preparation_name', preparations.name,
                        'food_name', foods.name,
                        'availability_state', case
                          when not exists (
                            select 1
                            from public.current_published_preparations()
                              as current
                            where current.preparation_id =
                              meal_components.preparation_id
                              and current.revision_id =
                                meal_components.revision_id
                          ) then 'replacement_required'
                          when eligibility.result->>'status' <> 'eligible'
                            then 'replacement_required'
                          else 'eligible'
                        end,
                        'unavailable_reason', case
                          when not exists (
                            select 1
                            from public.current_published_preparations()
                              as current
                            where current.preparation_id =
                              meal_components.preparation_id
                              and current.revision_id =
                                meal_components.revision_id
                          ) then 'preparation_not_approved'
                          when eligibility.result->>'status' <> 'eligible'
                            then coalesce(
                              eligibility.result->>'reason',
                              'eligibility_unavailable'
                            )
                          else null
                        end,
                        'is_locked', meal_components.is_locked,
                        'is_quick_backup', exists (
                          select 1
                          from public.quick_backups
                          where quick_backups.baby_id = active_baby.id
                            and quick_backups.food_id = foods.id
                        ),
                        'serving_status', case
                          when exists (
                            select 1
                            from public.batch_events
                            where batch_events.meal_component_id =
                              meal_components.id
                              and batch_events.event_type = 'served'
                          ) then 'served'
                          else 'planned'
                        end
                      )
                      order by meal_components.position
                    )
                    from public.meal_components
                    join public.preparations
                      on preparations.id =
                        meal_components.preparation_id
                    join public.foods
                      on foods.id = preparations.food_id
                    cross join lateral (
                      select public.get_preparation_eligibility(
                        preparations.slug
                      ) as result
                    ) as eligibility
                    where meal_components.meal_id = meal.id
                  ),
                  '[]'::jsonb
                )
              )
              order by configured.ordinality
            )
            from unnest(active_baby.meal_slots)
              with ordinality as configured(meal_slot, ordinality)
            left join lateral (
              select meals.*
              from public.meals
              where meals.plan_id = current_plan.id
                and meals.local_date = day.local_date
                and meals.meal_slot = configured.meal_slot
              limit 1
            ) as meal on true
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

create or replace function public.get_week_edit_options()
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

  select babies.id
    into active_baby_id
  from public.babies
  join public.user_profiles
    on user_profiles.household_id = babies.household_id
  where babies.is_active
    and user_profiles.user_id = caller_id
  limit 1;

  if active_baby_id is null then
    return jsonb_build_object(
      'status', 'unavailable',
      'reason', 'profile_unavailable',
      'items', '[]'::jsonb
    );
  end if;

  return jsonb_build_object(
    'status', 'ready',
    'items', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'preparation_slug', published.preparation_slug,
            'preparation_name', preparations.name,
            'food_name', published.food_name,
            'is_quick_backup', exists (
              select 1
              from public.quick_backups
              where quick_backups.baby_id = active_baby_id
                and quick_backups.food_id = published.food_id
            )
          )
          order by published.food_name, preparations.name
        ),
        '[]'::jsonb
      )
      from public.current_published_preparations() as published
      join public.preparations
        on preparations.id = published.preparation_id
      where public.get_preparation_eligibility(
        published.preparation_slug
      )->>'status' = 'eligible'
    )
  );
end;
$$;

create or replace function public.edit_manual_week(
  p_expected_version bigint,
  p_operation text,
  p_payload jsonb,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  active_baby public.babies%rowtype;
  target_plan public.meal_plans%rowtype;
  target_meal public.meals%rowtype;
  target_component public.meal_components%rowtype;
  source_meal public.meals%rowtype;
  existing_event public.meal_edit_events%rowtype;
  latest_event public.meal_edit_events%rowtype;
  preparation jsonb;
  before_state jsonb;
  after_state jsonb;
  result jsonb;
  result_details jsonb := '{}'::jsonb;
  target_meal_id uuid;
  target_component_id uuid;
  source_meal_id uuid;
  target_local_date date;
  target_meal_slot text;
  new_component_id uuid;
  new_version bigint;
  component_count integer;
  reorder_position integer := 0;
  component jsonb;
  restored_slug text;
begin
  if caller_id is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  if p_idempotency_key is null then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'idempotency_key_required'
    );
  end if;

  if p_expected_version is null or p_expected_version < 0 then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'version_required'
    );
  end if;

  if p_operation is null or p_operation not in (
    'add_component',
    'delete_component',
    'set_component_lock',
    'set_meal_lock',
    'swap_component',
    'swap_meal',
    'use_quick_backup',
    'copy_meal',
    'set_meal_status',
    'undo_last_swap'
  ) or p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'invalid_edit'
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_idempotency_key::text, 0)
  );

  select babies.*
    into active_baby
  from public.babies
  join public.user_profiles
    on user_profiles.household_id = babies.household_id
  where babies.is_active
    and user_profiles.user_id = caller_id
  for update of babies;

  if active_baby.id is null then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'profile_unavailable'
    );
  end if;

  select meal_plans.*
    into target_plan
  from public.meal_plans
  where meal_plans.baby_id = active_baby.id
  for update;

  if target_plan.id is null then
    select meal_edit_events.*
      into existing_event
    from public.meal_edit_events
    where meal_edit_events.idempotency_key = p_idempotency_key;

    if existing_event.id is not null then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'idempotency_key_conflict',
        'version', 0
      );
    end if;

    if p_expected_version <> 0 then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'plan_stale',
        'version', 0
      );
    end if;

    if p_operation <> 'add_component' then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', case
          when p_operation in (
            'delete_component',
            'set_component_lock',
            'swap_component'
          ) then 'component_unavailable'
          when p_operation = 'undo_last_swap' then 'nothing_to_undo'
          else 'meal_unavailable'
        end,
        'version', 0
      );
    end if;

    target_local_date := public.try_date(p_payload->>'local_date');
    target_meal_slot := p_payload->>'meal_slot';

    if target_local_date is null then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'invalid_local_date',
        'version', 0
      );
    end if;

    if target_meal_slot is null
      or not target_meal_slot = any(active_baby.meal_slots) then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'meal_slot_not_configured',
        'version', 0
      );
    end if;

    preparation := public.resolve_week_preparation(
      active_baby.id,
      p_payload->>'preparation_slug',
      false
    );
    if preparation->>'status' <> 'eligible' then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', preparation->>'reason',
        'version', 0
      );
    end if;

    insert into public.meal_plans (baby_id)
    values (active_baby.id)
    returning meal_plans.* into target_plan;
  end if;

  select meal_edit_events.*
    into existing_event
  from public.meal_edit_events
  where meal_edit_events.idempotency_key = p_idempotency_key;

  if existing_event.id is not null then
    if existing_event.plan_id = target_plan.id
      and existing_event.actor_user_id = caller_id
      and existing_event.operation = p_operation
      and existing_event.payload = p_payload then
      return existing_event.result
        || jsonb_build_object('idempotent_retry', true);
    end if;

    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'idempotency_key_conflict',
      'version', target_plan.version
    );
  end if;

  if target_plan.version <> p_expected_version then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'plan_stale',
      'version', target_plan.version
    );
  end if;

  if p_operation = 'add_component' then
    target_local_date := public.try_date(p_payload->>'local_date');
    target_meal_slot := p_payload->>'meal_slot';

    if target_local_date is null then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'invalid_local_date',
        'version', target_plan.version
      );
    end if;

    if target_meal_slot is null
      or not target_meal_slot = any(active_baby.meal_slots) then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'meal_slot_not_configured',
        'version', target_plan.version
      );
    end if;

    preparation := public.resolve_week_preparation(
      active_baby.id,
      p_payload->>'preparation_slug',
      false
    );
    if preparation->>'status' <> 'eligible' then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', preparation->>'reason',
        'version', target_plan.version
      );
    end if;

    select meals.*
      into target_meal
    from public.meals
    where meals.plan_id = target_plan.id
      and meals.local_date = target_local_date
      and meals.meal_slot = target_meal_slot
    for update;

    if target_meal.id is null then
      insert into public.meals (plan_id, local_date, meal_slot)
      values (target_plan.id, target_local_date, target_meal_slot)
      returning meals.* into target_meal;
    end if;

    if target_meal.is_locked then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'meal_locked',
        'version', target_plan.version
      );
    end if;

    if target_meal.status <> 'planned' then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'meal_not_planned',
        'version', target_plan.version
      );
    end if;

    if exists (
      select 1
      from public.meal_components
      where meal_components.meal_id = target_meal.id
        and meal_components.preparation_id =
          preparation->>'preparation_id'
    ) then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'preparation_already_planned',
        'version', target_plan.version
      );
    end if;

    select count(*)
      into component_count
    from public.meal_components
    where meal_components.meal_id = target_meal.id;

    if component_count >= 3 then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'meal_component_limit_reached',
        'version', target_plan.version
      );
    end if;

    before_state := public.manual_meal_state(target_meal.id);
    insert into public.meal_components (
      meal_id,
      preparation_id,
      revision_id,
      position
    ) values (
      target_meal.id,
      preparation->>'preparation_id',
      preparation->>'revision_id',
      component_count + 1
    )
    returning meal_components.id into new_component_id;
    after_state := public.manual_meal_state(target_meal.id);
    result_details := jsonb_build_object(
      'meal_id', target_meal.id,
      'component_id', new_component_id,
      'preparation_id', preparation->>'preparation_id'
    );

  elsif p_operation = 'delete_component' then
    target_component_id := public.try_uuid(
      p_payload->>'component_id'
    );

    select meal_components.*
      into target_component
    from public.meal_components
    join public.meals on meals.id = meal_components.meal_id
    where meal_components.id = target_component_id
      and meals.plan_id = target_plan.id
    for update of meal_components;

    if target_component.id is null then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'component_unavailable',
        'version', target_plan.version
      );
    end if;

    select meals.*
      into target_meal
    from public.meals
    where meals.id = target_component.meal_id
    for update;

    if target_meal.is_locked then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'meal_locked',
        'version', target_plan.version
      );
    end if;

    if target_component.is_locked then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'component_locked',
        'version', target_plan.version
      );
    end if;

    if target_meal.status <> 'planned' then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'meal_not_planned',
        'version', target_plan.version
      );
    end if;

    if exists (
      select 1
      from public.batch_events
      where batch_events.meal_component_id = target_component.id
        and batch_events.event_type = 'served'
    ) then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'component_already_served',
        'version', target_plan.version
      );
    end if;

    before_state := public.manual_meal_state(target_meal.id);
    delete from public.meal_components
    where meal_components.id = target_component.id;

    reorder_position := 0;
    for target_component in
      select meal_components.*
      from public.meal_components
      where meal_components.meal_id = target_meal.id
      order by meal_components.position
    loop
      reorder_position := reorder_position + 1;
      update public.meal_components
      set position = reorder_position
      where meal_components.id = target_component.id;
    end loop;

    after_state := public.manual_meal_state(target_meal.id);
    result_details := jsonb_build_object(
      'meal_id', target_meal.id,
      'component_id', target_component_id
    );

  elsif p_operation = 'set_component_lock' then
    target_component_id := public.try_uuid(
      p_payload->>'component_id'
    );
    if jsonb_typeof(p_payload->'locked')
      is distinct from 'boolean' then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'invalid_lock_state',
        'version', target_plan.version
      );
    end if;

    select meal_components.*
      into target_component
    from public.meal_components
    join public.meals on meals.id = meal_components.meal_id
    where meal_components.id = target_component_id
      and meals.plan_id = target_plan.id
    for update of meal_components;

    if target_component.id is null then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'component_unavailable',
        'version', target_plan.version
      );
    end if;

    before_state := public.manual_meal_state(
      target_component.meal_id
    );
    update public.meal_components
    set is_locked = (p_payload->>'locked')::boolean
    where meal_components.id = target_component.id;
    after_state := public.manual_meal_state(
      target_component.meal_id
    );
    result_details := jsonb_build_object(
      'meal_id', target_component.meal_id,
      'component_id', target_component.id,
      'locked', (p_payload->>'locked')::boolean
    );

  elsif p_operation = 'set_meal_lock' then
    target_meal_id := public.try_uuid(p_payload->>'meal_id');
    if jsonb_typeof(p_payload->'locked')
      is distinct from 'boolean' then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'invalid_lock_state',
        'version', target_plan.version
      );
    end if;

    select meals.*
      into target_meal
    from public.meals
    where meals.id = target_meal_id
      and meals.plan_id = target_plan.id
    for update;

    if target_meal.id is null then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'meal_unavailable',
        'version', target_plan.version
      );
    end if;

    before_state := public.manual_meal_state(target_meal.id);
    update public.meals
    set is_locked = (p_payload->>'locked')::boolean
    where meals.id = target_meal.id;
    after_state := public.manual_meal_state(target_meal.id);
    result_details := jsonb_build_object(
      'meal_id', target_meal.id,
      'locked', (p_payload->>'locked')::boolean
    );

  elsif p_operation = 'swap_component' then
    target_component_id := public.try_uuid(
      p_payload->>'component_id'
    );

    select meal_components.*
      into target_component
    from public.meal_components
    join public.meals on meals.id = meal_components.meal_id
    where meal_components.id = target_component_id
      and meals.plan_id = target_plan.id
    for update of meal_components;

    if target_component.id is null then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'component_unavailable',
        'version', target_plan.version
      );
    end if;

    select meals.*
      into target_meal
    from public.meals
    where meals.id = target_component.meal_id
    for update;

    if target_meal.is_locked then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'meal_locked',
        'version', target_plan.version
      );
    end if;

    if target_component.is_locked then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'component_locked',
        'version', target_plan.version
      );
    end if;

    if target_meal.status <> 'planned' then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'meal_not_planned',
        'version', target_plan.version
      );
    end if;

    if exists (
      select 1
      from public.batch_events
      where batch_events.meal_component_id = target_component.id
        and batch_events.event_type = 'served'
    ) then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'component_already_served',
        'version', target_plan.version
      );
    end if;

    preparation := public.resolve_week_preparation(
      active_baby.id,
      p_payload->>'preparation_slug',
      false
    );
    if preparation->>'status' <> 'eligible' then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', preparation->>'reason',
        'version', target_plan.version
      );
    end if;

    if exists (
      select 1
      from public.meal_components
      where meal_components.meal_id = target_meal.id
        and meal_components.id <> target_component.id
        and meal_components.preparation_id =
          preparation->>'preparation_id'
    ) then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'preparation_already_planned',
        'version', target_plan.version
      );
    end if;

    before_state := public.manual_meal_state(target_meal.id);
    update public.meal_components
    set
      preparation_id = preparation->>'preparation_id',
      revision_id = preparation->>'revision_id'
    where meal_components.id = target_component.id;
    after_state := public.manual_meal_state(target_meal.id);
    result_details := jsonb_build_object(
      'meal_id', target_meal.id,
      'component_id', target_component.id,
      'preparation_id', preparation->>'preparation_id'
    );

  elsif p_operation in ('swap_meal', 'use_quick_backup') then
    target_meal_id := public.try_uuid(p_payload->>'meal_id');
    select meals.*
      into target_meal
    from public.meals
    where meals.id = target_meal_id
      and meals.plan_id = target_plan.id
    for update;

    if target_meal.id is null then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'meal_unavailable',
        'version', target_plan.version
      );
    end if;

    if target_meal.is_locked or exists (
      select 1
      from public.meal_components
      where meal_components.meal_id = target_meal.id
        and meal_components.is_locked
    ) then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'meal_locked',
        'version', target_plan.version
      );
    end if;

    if target_meal.status <> 'planned' then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'meal_not_planned',
        'version', target_plan.version
      );
    end if;

    if exists (
      select 1
      from public.batch_events
      join public.meal_components
        on meal_components.id = batch_events.meal_component_id
      where meal_components.meal_id = target_meal.id
        and batch_events.event_type = 'served'
    ) then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'meal_already_served',
        'version', target_plan.version
      );
    end if;

    preparation := public.resolve_week_preparation(
      active_baby.id,
      p_payload->>'preparation_slug',
      p_operation = 'use_quick_backup'
    );
    if preparation->>'status' <> 'eligible' then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', preparation->>'reason',
        'version', target_plan.version
      );
    end if;

    before_state := public.manual_meal_state(target_meal.id);
    delete from public.meal_components
    where meal_components.meal_id = target_meal.id;
    insert into public.meal_components (
      meal_id,
      preparation_id,
      revision_id,
      position
    ) values (
      target_meal.id,
      preparation->>'preparation_id',
      preparation->>'revision_id',
      1
    )
    returning meal_components.id into new_component_id;
    after_state := public.manual_meal_state(target_meal.id);
    result_details := jsonb_build_object(
      'meal_id', target_meal.id,
      'component_id', new_component_id,
      'preparation_id', preparation->>'preparation_id'
    );

  elsif p_operation = 'copy_meal' then
    source_meal_id := public.try_uuid(p_payload->>'source_meal_id');
    target_local_date := public.try_date(
      p_payload->>'target_local_date'
    );
    target_meal_slot := p_payload->>'target_meal_slot';

    select meals.*
      into source_meal
    from public.meals
    where meals.id = source_meal_id
      and meals.plan_id = target_plan.id
    for update;

    if source_meal.id is null then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'meal_unavailable',
        'version', target_plan.version
      );
    end if;

    if target_local_date is null then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'invalid_local_date',
        'version', target_plan.version
      );
    end if;

    if target_meal_slot is null
      or not target_meal_slot = any(active_baby.meal_slots) then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'meal_slot_not_configured',
        'version', target_plan.version
      );
    end if;

    select count(*)
      into component_count
    from public.meal_components
    where meal_components.meal_id = source_meal.id;

    if component_count = 0 then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'source_meal_empty',
        'version', target_plan.version
      );
    end if;

    for component in
      select jsonb_build_object(
        'preparation_slug', preparations.slug,
        'preparation_id', meal_components.preparation_id,
        'revision_id', meal_components.revision_id
      )
      from public.meal_components
      join public.preparations
        on preparations.id = meal_components.preparation_id
      where meal_components.meal_id = source_meal.id
      order by meal_components.position
    loop
      preparation := public.resolve_week_preparation(
        active_baby.id,
        component->>'preparation_slug',
        false
      );
      if preparation->>'status' <> 'eligible' then
        return jsonb_build_object(
          'status', 'rejected',
          'reason', preparation->>'reason',
          'version', target_plan.version
        );
      end if;

      if preparation->>'preparation_id'
          <> component->>'preparation_id'
        or preparation->>'revision_id'
          <> component->>'revision_id' then
        return jsonb_build_object(
          'status', 'rejected',
          'reason', 'source_preparation_changed',
          'version', target_plan.version
        );
      end if;
    end loop;

    select meals.*
      into target_meal
    from public.meals
    where meals.plan_id = target_plan.id
      and meals.local_date = target_local_date
      and meals.meal_slot = target_meal_slot
    for update;

    if target_meal.id is null then
      insert into public.meals (plan_id, local_date, meal_slot)
      values (target_plan.id, target_local_date, target_meal_slot)
      returning meals.* into target_meal;
    end if;

    if target_meal.is_locked then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'meal_locked',
        'version', target_plan.version
      );
    end if;

    if target_meal.status <> 'planned' then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'meal_not_planned',
        'version', target_plan.version
      );
    end if;

    if exists (
      select 1
      from public.meal_components
      where meal_components.meal_id = target_meal.id
    ) then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'target_meal_not_empty',
        'version', target_plan.version
      );
    end if;

    before_state := public.manual_meal_state(target_meal.id);
    insert into public.meal_components (
      meal_id,
      preparation_id,
      revision_id,
      position
    )
    select
      target_meal.id,
      meal_components.preparation_id,
      meal_components.revision_id,
      meal_components.position
    from public.meal_components
    where meal_components.meal_id = source_meal.id
    order by meal_components.position;
    after_state := public.manual_meal_state(target_meal.id);
    result_details := jsonb_build_object(
      'meal_id', target_meal.id,
      'source_meal_id', source_meal.id
    );

  elsif p_operation = 'set_meal_status' then
    target_meal_id := public.try_uuid(p_payload->>'meal_id');
    select meals.*
      into target_meal
    from public.meals
    where meals.id = target_meal_id
      and meals.plan_id = target_plan.id
    for update;

    if target_meal.id is null then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'meal_unavailable',
        'version', target_plan.version
      );
    end if;

    if target_meal.is_locked then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'meal_locked',
        'version', target_plan.version
      );
    end if;

    if p_payload->>'status' is null
      or p_payload->>'status' not in (
      'planned',
      'skipped',
      'completed'
    ) then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'invalid_meal_status',
        'version', target_plan.version
      );
    end if;

    if p_payload->>'status' = 'skipped'
      and exists (
        select 1
        from public.batch_events
        join public.meal_components
          on meal_components.id = batch_events.meal_component_id
        where meal_components.meal_id = target_meal.id
          and batch_events.event_type = 'served'
      ) then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'meal_already_served',
        'version', target_plan.version
      );
    end if;

    before_state := public.manual_meal_state(target_meal.id);
    update public.meals
    set status = p_payload->>'status'
    where meals.id = target_meal.id;
    after_state := public.manual_meal_state(target_meal.id);
    result_details := jsonb_build_object(
      'meal_id', target_meal.id,
      'meal_status', p_payload->>'status'
    );

  elsif p_operation = 'undo_last_swap' then
    select meal_edit_events.*
      into latest_event
    from public.meal_edit_events
    where meal_edit_events.plan_id = target_plan.id
    order by meal_edit_events.version desc
    limit 1
    for update;

    if latest_event.id is null or latest_event.operation not in (
      'swap_component',
      'swap_meal',
      'use_quick_backup'
    ) then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'nothing_to_undo',
        'version', target_plan.version
      );
    end if;

    target_meal_id := public.try_uuid(
      latest_event.after_state->>'meal_id'
    );
    select meals.*
      into target_meal
    from public.meals
    where meals.id = target_meal_id
      and meals.plan_id = target_plan.id
    for update;

    if target_meal.id is null
      or public.manual_meal_state(target_meal.id)
        <> latest_event.after_state then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'undo_state_changed',
        'version', target_plan.version
      );
    end if;

    if exists (
      select 1
      from public.batch_events
      join public.meal_components
        on meal_components.id = batch_events.meal_component_id
      where meal_components.meal_id = target_meal.id
        and batch_events.event_type = 'served'
    ) then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'meal_already_served',
        'version', target_plan.version
      );
    end if;

    for component in
      select value
      from jsonb_array_elements(
        latest_event.before_state->'components'
      )
    loop
      restored_slug := component->>'preparation_slug';
      preparation := public.resolve_week_preparation(
        active_baby.id,
        restored_slug,
        false
      );
      if preparation->>'status' <> 'eligible'
        or preparation->>'preparation_id'
          <> component->>'preparation_id'
        or preparation->>'revision_id'
          <> component->>'revision_id' then
        return jsonb_build_object(
          'status', 'rejected',
          'reason', coalesce(
            preparation->>'reason',
            'preparation_not_approved'
          ),
          'version', target_plan.version
        );
      end if;
    end loop;

    before_state := public.manual_meal_state(target_meal.id);
    delete from public.meal_components
    where meal_components.meal_id = target_meal.id;
    update public.meals
    set
      status = latest_event.before_state->>'status',
      is_locked =
        (latest_event.before_state->>'is_locked')::boolean
    where meals.id = target_meal.id;

    insert into public.meal_components (
      id,
      meal_id,
      preparation_id,
      revision_id,
      position,
      is_locked
    )
    select
      (value->>'component_id')::uuid,
      target_meal.id,
      value->>'preparation_id',
      value->>'revision_id',
      (value->>'position')::smallint,
      (value->>'is_locked')::boolean
    from jsonb_array_elements(
      latest_event.before_state->'components'
    );

    after_state := public.manual_meal_state(target_meal.id);
    result_details := jsonb_build_object(
      'meal_id', target_meal.id,
      'compensated_operation', latest_event.operation
    );
  end if;

  new_version := target_plan.version + 1;
  update public.meal_plans
  set version = new_version
  where meal_plans.id = target_plan.id;

  result := jsonb_build_object(
    'status', 'applied',
    'operation', p_operation,
    'version', new_version,
    'idempotent_retry', false
  ) || result_details;

  insert into public.meal_edit_events (
    plan_id,
    version,
    operation,
    payload,
    before_state,
    after_state,
    result,
    actor_user_id,
    idempotency_key,
    compensates_event_id
  ) values (
    target_plan.id,
    new_version,
    p_operation,
    p_payload,
    before_state,
    after_state,
    result,
    caller_id,
    p_idempotency_key,
    case
      when p_operation = 'undo_last_swap' then latest_event.id
      else null
    end
  );

  return result;
end;
$$;

create or replace function public.get_today_meal()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  trusted_now timestamptz := statement_timestamp();
  active_baby public.babies%rowtype;
  target_meal record;
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
  where babies.is_active
    and user_profiles.user_id = caller_id
  limit 1;

  if active_baby.id is null then
    return jsonb_build_object(
      'status', 'unavailable',
      'reason', 'profile_unavailable'
    );
  end if;

  select
    meals.id,
    meals.local_date,
    meals.meal_slot
    into target_meal
  from public.meals
  join public.meal_plans on meal_plans.id = meals.plan_id
  where meal_plans.baby_id = active_baby.id
    and meals.status = 'planned'
    and meals.local_date >=
      (trusted_now at time zone active_baby.time_zone)::date
    and exists (
      select 1
      from public.meal_components
      where meal_components.meal_id = meals.id
        and not exists (
          select 1
          from public.batch_events
          where batch_events.meal_component_id = meal_components.id
            and batch_events.event_type = 'served'
        )
    )
  order by
    meals.local_date,
    array_position(active_baby.meal_slots, meals.meal_slot)
  limit 1;

  if target_meal.id is null then
    return jsonb_build_object(
      'status', 'empty',
      'baby_id', active_baby.id,
      'time_zone', active_baby.time_zone
    );
  end if;

  return jsonb_build_object(
    'status', 'ready',
    'baby_id', active_baby.id,
    'time_zone', active_baby.time_zone,
    'local_date', target_meal.local_date,
    'meal_slot', target_meal.meal_slot,
    'components', (
      select jsonb_agg(
        jsonb_build_object(
          'component_id', component.id,
          'preparation_id', component.preparation_id,
          'revision_id', component.revision_id,
          'preparation_slug', component.preparation_slug,
          'preparation_name', component.preparation_name,
          'food_name', component.food_name,
          'availability_state', case
            when component.served_event_id is not null then 'served'
            when not component.is_published
              or component.eligibility->>'status' <> 'eligible'
              then 'unavailable'
            when component.batch_id is not null then 'ready'
            else 'quick_preparation'
          end,
          'unavailable_reason', case
            when component.served_event_id is not null then null
            when not component.is_published then 'preparation_not_approved'
            when component.eligibility->>'status' <> 'eligible'
              then coalesce(
                component.eligibility->>'reason',
                'eligibility_unavailable'
              )
            else null
          end,
          'batch_id', component.batch_id,
          'remaining_portions', component.remaining_portions,
          'deadline_at', component.deadline_at,
          'guidance', component.guidance,
          'source_title', component.source_title,
          'source_url', component.source_url,
          'reviewed_at', component.reviewed_at
        )
        order by component.position
      )
      from (
        select
          meal_components.id,
          meal_components.position,
          meal_components.preparation_id,
          meal_components.revision_id,
          preparations.name as preparation_name,
          preparations.slug as preparation_slug,
          foods.name as food_name,
          exists (
            select 1
            from public.current_published_preparations() as published
            where published.preparation_id =
              meal_components.preparation_id
              and published.revision_id = meal_components.revision_id
          ) as is_published,
          public.get_preparation_eligibility(
            preparations.slug
          ) as eligibility,
          served_event.id as served_event_id,
          ready_batch.id as batch_id,
          ready_batch.remaining_portions,
          ready_batch.deadline_at,
          ready_batch.guidance,
          ready_batch.source_title,
          ready_batch.source_url,
          ready_batch.reviewed_at
        from public.meal_components
        join public.preparations
          on preparations.id = meal_components.preparation_id
        join public.foods on foods.id = preparations.food_id
        left join lateral (
          select batch_events.id
          from public.batch_events
          where batch_events.meal_component_id = meal_components.id
            and batch_events.event_type = 'served'
          limit 1
        ) as served_event on true
        left join lateral (
          select
            batches.id,
            public.reconciled_batch_portions(batches.id)
              as remaining_portions,
            batch_deadlines.deadline_at,
            storage_rules.guidance,
            sources.title as source_title,
            sources.url as source_url,
            storage_rule_profiles.reviewed_at
          from public.batches
          join public.batch_deadlines
            on batch_deadlines.batch_id = batches.id
          join public.storage_rule_profiles
            on storage_rule_profiles.id =
              batch_deadlines.rule_profile_id
          join public.storage_rules
            on storage_rules.id = batch_deadlines.storage_rule_id
            and storage_rules.revision_id =
              batch_deadlines.content_revision_id
          join public.sources
            on sources.id = storage_rule_profiles.source_id
          where batches.baby_id = active_baby.id
            and batches.preparation_id =
              meal_components.preparation_id
            and batches.content_revision_id =
              meal_components.revision_id
            and batches.storage_location = 'refrigerator'
            and batch_deadlines.deadline_at > trusted_now
            and public.reconciled_batch_portions(batches.id) > 0
          order by batch_deadlines.deadline_at, batches.id
          limit 1
        ) as ready_batch on true
        where meal_components.meal_id = target_meal.id
      ) as component
    )
  );
end;
$$;

alter function public.serve_planned_portion(uuid, uuid, uuid)
  rename to serve_planned_portion_ticket_07;

revoke all on function public.serve_planned_portion_ticket_07(
  uuid,
  uuid,
  uuid
) from public, anon, authenticated;

create or replace function public.serve_planned_portion(
  p_meal_component_id uuid,
  p_batch_id uuid,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  locked_baby_id uuid;
  target_status text;
begin
  if caller_id is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  if p_idempotency_key is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(p_idempotency_key::text, 0)
    );
  end if;

  if p_idempotency_key is not null
    and exists (
      select 1
      from public.batch_events
      where batch_events.idempotency_key = p_idempotency_key
    ) then
    return public.serve_planned_portion_ticket_07(
      p_meal_component_id,
      p_batch_id,
      p_idempotency_key
    );
  end if;

  select babies.id
    into locked_baby_id
  from public.babies
  join public.user_profiles
    on user_profiles.household_id = babies.household_id
  where babies.is_active
    and user_profiles.user_id = caller_id
  limit 1
  for update of babies;

  if locked_baby_id is not null then
    select meals.status
      into target_status
    from public.meal_components
    join public.meals on meals.id = meal_components.meal_id
    join public.meal_plans on meal_plans.id = meals.plan_id
    where meal_components.id = p_meal_component_id
      and meal_plans.baby_id = locked_baby_id;

    if target_status is distinct from 'planned'
      and target_status is not null then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'meal_not_planned'
      );
    end if;
  end if;

  return public.serve_planned_portion_ticket_07(
    p_meal_component_id,
    p_batch_id,
    p_idempotency_key
  );
end;
$$;

revoke all on function public.serve_planned_portion(uuid, uuid, uuid)
  from public, anon;
grant execute on function public.serve_planned_portion(uuid, uuid, uuid)
  to authenticated;


revoke all on function public.try_uuid(text)
  from public, anon, authenticated;
revoke all on function public.try_date(text)
  from public, anon, authenticated;
revoke all on function public.manual_meal_state(uuid)
  from public, anon, authenticated;
revoke all on function public.resolve_week_preparation(uuid, text, boolean)
  from public, anon, authenticated;
revoke all on function public.get_week_window(date)
  from public, anon;
revoke all on function public.get_week_edit_options()
  from public, anon;
revoke all on function public.edit_manual_week(bigint, text, jsonb, uuid)
  from public, anon;

grant execute on function public.get_week_window(date)
  to authenticated;
grant execute on function public.get_week_edit_options()
  to authenticated;
grant execute on function public.edit_manual_week(bigint, text, jsonb, uuid)
  to authenticated;

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
  current_version bigint;
  target_local_date date;
  edit_result jsonb;
  existing_component record;
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

  select coalesce(meal_plans.version, 0)
    into current_version
  from public.meal_plans
  where meal_plans.baby_id = active_baby.id;
  current_version := coalesce(current_version, 0);

  target_local_date := public.tomorrow_in_time_zone(
    statement_timestamp(),
    active_baby.time_zone
  );

  edit_result := public.edit_manual_week(
    current_version,
    'add_component',
    jsonb_build_object(
      'local_date', target_local_date,
      'meal_slot', p_meal_slot,
      'preparation_slug', p_preparation_slug
    ),
    gen_random_uuid()
  );

  if edit_result->>'status' = 'applied' then
    return jsonb_build_object(
      'status', 'planned',
      'component_id', edit_result->>'component_id',
      'local_date', target_local_date,
      'meal_slot', p_meal_slot,
      'preparation_id', edit_result->>'preparation_id',
      'revision_id', (
        select meal_components.revision_id
        from public.meal_components
        where meal_components.id =
          (edit_result->>'component_id')::uuid
      )
    );
  end if;

  if edit_result->>'reason' = 'preparation_already_planned' then
    select
      meal_components.id,
      meal_components.preparation_id,
      meal_components.revision_id
      into existing_component
    from public.meal_components
    join public.meals on meals.id = meal_components.meal_id
    join public.meal_plans on meal_plans.id = meals.plan_id
    join public.preparations
      on preparations.id = meal_components.preparation_id
    where meal_plans.baby_id = active_baby.id
      and meals.local_date = target_local_date
      and meals.meal_slot = p_meal_slot
      and preparations.slug = p_preparation_slug;

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
  end if;

  if edit_result->>'status' = 'rejected' then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', edit_result->>'reason'
    );
  end if;

  return edit_result;
end;
$$;

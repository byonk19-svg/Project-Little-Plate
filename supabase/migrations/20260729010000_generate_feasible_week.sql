alter table public.meal_plans
  add column planner_reproducibility_hash text,
  add column planner_input_token text,
  add column planner_rule_revision_ids text[] not null default '{}',
  add column planner_explanations jsonb not null default '{}'::jsonb
    check (jsonb_typeof(planner_explanations) = 'object'),
  add column planner_window_start date,
  add column planner_generated_version bigint,
  add column generated_at timestamptz;

create table public.planner_generation_events (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.meal_plans (id) on delete cascade,
  version bigint not null check (version > 0),
  operation text not null check (operation in ('generate', 'regenerate')),
  input_token text not null check (btrim(input_token) <> ''),
  request_fingerprint text not null check (btrim(request_fingerprint) <> ''),
  reference_at timestamptz not null,
  reproducibility_hash text not null check (btrim(reproducibility_hash) <> ''),
  rule_revision_ids text[] not null,
  output jsonb not null check (jsonb_typeof(output) = 'object'),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  actor_user_id uuid not null,
  idempotency_key uuid not null unique,
  occurred_at timestamptz not null default now(),
  unique (plan_id, version)
);

create index planner_generation_events_plan_occurred_idx
  on public.planner_generation_events (plan_id, occurred_at desc);

alter table public.planner_generation_events enable row level security;

create policy "Caregivers can read their planner generation history"
  on public.planner_generation_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.meal_plans
      join public.babies on babies.id = meal_plans.baby_id
      join public.user_profiles
        on user_profiles.household_id = babies.household_id
      where meal_plans.id = planner_generation_events.plan_id
        and user_profiles.user_id = (select auth.uid())
    )
  );

revoke all on table public.planner_generation_events
  from public, anon, authenticated;
grant select on table public.planner_generation_events to authenticated;
grant select, insert on table public.planner_generation_events to service_role;

create or replace function public.prevent_planner_generation_event_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Planner generation events are append-only'
    using errcode = '55000';
end;
$$;

create trigger planner_generation_events_append_only
before update or delete on public.planner_generation_events
for each row execute function public.prevent_planner_generation_event_changes();

create or replace function public.get_planner_generation_snapshot(
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
  window_start date;
  week_value jsonb;
  feeding_value jsonb;
  inventory_value jsonb;
  meal_requests jsonb;
  candidates jsonb;
  payload jsonb;
begin
  if caller_id is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  if p_reference_at is null then
    return jsonb_build_object(
      'status', 'unavailable',
      'reason', 'reference_time_required'
    );
  end if;

  select babies.*
    into active_baby
  from public.babies
  join public.user_profiles
    on user_profiles.household_id = babies.household_id
  where babies.is_active
    and user_profiles.user_id = caller_id;

  if active_baby.id is null then
    return jsonb_build_object(
      'status', 'unavailable',
      'reason', 'profile_unavailable'
    );
  end if;

  window_start := (p_reference_at at time zone active_baby.time_zone)::date;
  week_value := public.get_week_window(window_start);
  feeding_value := public.get_feeding_configuration();
  inventory_value := public.get_kitchen_inventory();

  if week_value->>'status' <> 'ready'
    or feeding_value->>'status' <> 'ready'
    or inventory_value->>'status' <> 'ready'
    or feeding_value->'preferences' is null then
    return jsonb_build_object(
      'status', 'unavailable',
      'reason', 'snapshot_unavailable'
    );
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'meal_id', request.local_date || ':' || request.meal_slot,
        'local_date', request.local_date,
        'meal_slot', request.meal_slot,
        'consume_by', (
          (request.local_date::date + 1)::timestamp
          at time zone active_baby.time_zone
        ),
        'component_count', greatest(1, request.component_count),
        'is_locked', request.is_locked,
        'locked_components', request.locked_components
      )
      order by request.local_date, request.slot_order
    ),
    '[]'::jsonb
  )
    into meal_requests
  from (
    select
      day->>'local_date' as local_date,
      slot->>'meal_slot' as meal_slot,
      case slot->>'meal_slot'
        when 'breakfast' then 1
        when 'lunch' then 2
        else 3
      end as slot_order,
      (slot->>'is_locked')::boolean as is_locked,
      jsonb_array_length(slot->'components') as component_count,
      (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'position', (component->>'position')::integer - 1,
              'preparation_id', component->>'preparation_id',
              'revision_id', component->>'revision_id'
            )
            order by (component->>'position')::integer
          ),
          '[]'::jsonb
        )
        from jsonb_array_elements(slot->'components') as component
        where (slot->>'is_locked')::boolean
          or (component->>'is_locked')::boolean
      ) as locked_components
    from jsonb_array_elements(week_value->'days') as day
    cross join lateral jsonb_array_elements(day->'slots') as slot
    where slot->>'status' = 'planned'
      and not exists (
        select 1
        from jsonb_array_elements(slot->'components') as component
        where component->>'serving_status' = 'served'
      )
  ) as request;

  select coalesce(
    jsonb_agg(candidate.value order by candidate.value->>'preparation_id'),
    '[]'::jsonb
  )
    into candidates
  from (
    select jsonb_build_object(
      'preparation_id', published.preparation_id,
      'revision_id', published.revision_id,
      'food_id', published.food_id,
      'preparation_slug', published.preparation_slug,
      'required_skill_tag_ids', (
        select coalesce(jsonb_agg(tags.id order by tags.id), '[]'::jsonb)
        from public.revision_tags
        join public.tags on tags.id = revision_tags.tag_id
        where revision_tags.revision_id = published.revision_id
          and tags.kind = 'skill'
      ),
      'refrigerator_profiles', (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'profile_id', profiles.id,
              'duration_min_hours', profiles.duration_min_hours,
              'reviewed_at', profiles.reviewed_at,
              'source_id', profiles.source_id
            )
            order by profiles.precedence, profiles.id
          ),
          '[]'::jsonb
        )
        from public.storage_rule_profiles as profiles
        where profiles.content_revision_id = published.revision_id
          and profiles.storage_location = 'refrigerator'
          and profiles.next_review_at >= window_start + 6
      )
    ) as value
    from public.current_published_preparations() as published
    where public.get_preparation_eligibility(
      published.preparation_slug
    )->>'status' = 'eligible'
      and exists (
        select 1
        from public.content_revisions
        where content_revisions.id = published.revision_id
          and content_revisions.next_review_at >= window_start + 6
      )
  ) as candidate;

  payload := jsonb_build_object(
    'status', 'ready',
    'reference_at', p_reference_at,
    'baby_id', active_baby.id,
    'time_zone', active_baby.time_zone,
    'plan_id', week_value->'plan_id',
    'expected_version', week_value->'version',
    'window_start', week_value->'window_start',
    'meal_requests', meal_requests,
    'feeding', feeding_value,
    'inventory', inventory_value->'items',
    'candidates', candidates
  );

  return payload || jsonb_build_object(
    'input_token', md5(payload::text)
  );
end;
$$;

create or replace function public.commit_generated_week(
  p_expected_version bigint,
  p_input_token text,
  p_reference_at timestamptz,
  p_output jsonb,
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
  existing_event public.planner_generation_events%rowtype;
  current_snapshot jsonb;
  output_meal jsonb;
  output_component jsonb;
  expected_request jsonb;
  candidate jsonb;
  inventory_item jsonb;
  profile jsonb;
  target_meal public.meals%rowtype;
  target_local_date date;
  target_meal_slot text;
  new_version bigint;
  batch_use jsonb := '{}'::jsonb;
  used_count integer;
  canonical_plan jsonb;
  canonical_explanations jsonb;
  canonical_output jsonb;
  canonical_rule_revision_ids text[];
  canonical_hash text;
  request_fingerprint text;
  result jsonb;
begin
  if caller_id is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  request_fingerprint := md5((p_output->'plan')::text);

  if p_idempotency_key is null
    or p_expected_version is null
    or p_expected_version < 0
    or p_input_token is null
    or btrim(p_input_token) = ''
    or p_reference_at is null
    or p_reference_at < statement_timestamp() - interval '10 minutes'
    or p_reference_at > statement_timestamp() + interval '1 minute'
    or p_output is null
    or jsonb_typeof(p_output) <> 'object'
    or p_output->>'status' <> 'feasible'
    or jsonb_typeof(p_output->'plan') <> 'object'
    or jsonb_typeof(p_output->'plan'->'meals') <> 'array' then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'invalid_generated_output'
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_idempotency_key::text, 0)
  );

  select planner_generation_events.*
    into existing_event
  from public.planner_generation_events
  where planner_generation_events.idempotency_key = p_idempotency_key;

  if existing_event.id is not null then
    if existing_event.actor_user_id = caller_id
      and existing_event.input_token = p_input_token
      and existing_event.request_fingerprint = request_fingerprint then
      return existing_event.result
        || jsonb_build_object('idempotent_retry', true);
    end if;
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'idempotency_key_conflict'
    );
  end if;

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

  current_snapshot := public.get_planner_generation_snapshot(p_reference_at);
  if current_snapshot->>'status' <> 'ready'
    or current_snapshot->>'input_token' <> p_input_token then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'planner_input_stale',
      'version', 0
    );
  end if;

  select meal_plans.*
    into target_plan
  from public.meal_plans
  where meal_plans.baby_id = active_baby.id
  for update;

  if target_plan.id is null then
    if p_expected_version <> 0 then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'plan_stale',
        'version', 0
      );
    end if;
  elsif target_plan.version <> p_expected_version then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'plan_stale',
      'version', target_plan.version
    );
  end if;

  if jsonb_array_length(p_output->'plan'->'meals')
    <> jsonb_array_length(current_snapshot->'meal_requests') then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'incomplete_plan',
      'version', target_plan.version
    );
  end if;

  for expected_request in
    select value
    from jsonb_array_elements(current_snapshot->'meal_requests')
  loop
    select value
      into output_meal
    from jsonb_array_elements(p_output->'plan'->'meals')
    where value->>'mealId' = expected_request->>'meal_id'
      and value->>'localDate' = expected_request->>'local_date'
      and value->>'mealSlot' = expected_request->>'meal_slot';

    if output_meal is null
      or jsonb_typeof(output_meal->'components') <> 'array'
      or jsonb_array_length(output_meal->'components') < 1
      or jsonb_array_length(output_meal->'components') > 3
      or jsonb_array_length(output_meal->'components')
        <> (expected_request->>'component_count')::integer then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'incomplete_plan',
        'version', target_plan.version
      );
    end if;

    if exists (
      select 1
      from jsonb_array_elements(output_meal->'components') as component
      where public.try_integer(component->>'position') is null
        or public.try_integer(component->>'position') < 0
        or public.try_integer(component->>'position')
          >= (expected_request->>'component_count')::integer
        or component->>'preparationId' is null
        or component->>'revisionId' is null
        or component->>'source' not in (
          'existing_refrigerated',
          'new_preparation'
        )
    ) or (
      select count(distinct public.try_integer(component->>'position'))
      from jsonb_array_elements(output_meal->'components') as component
    ) <> (expected_request->>'component_count')::integer
    or (
      select count(distinct component->>'preparationId')
      from jsonb_array_elements(output_meal->'components') as component
    ) <> (expected_request->>'component_count')::integer then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'invalid_generated_output',
        'version', target_plan.version
      );
    end if;

    if exists (
      select 1
      from jsonb_array_elements(
        expected_request->'locked_components'
      ) as locked
      where not exists (
        select 1
        from jsonb_array_elements(output_meal->'components') as component
        where public.try_integer(component->>'position')
            = public.try_integer(locked->>'position')
          and component->>'preparationId'
            = locked->>'preparation_id'
          and component->>'revisionId' = locked->>'revision_id'
      )
    ) then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'locked_decision_changed',
        'version', target_plan.version
      );
    end if;

    for output_component in
      select value
      from jsonb_array_elements(output_meal->'components')
    loop
      if public.try_integer(output_component->>'position') is null
        or (output_component->>'position')::integer < 0
        or (output_component->>'position')::integer > 2
        or output_component->>'preparationId' is null
        or output_component->>'revisionId' is null
        or output_component->>'source' not in (
          'existing_refrigerated',
          'new_preparation'
        ) then
        return jsonb_build_object(
          'status', 'rejected',
          'reason', 'invalid_generated_output',
          'version', target_plan.version
        );
      end if;

      select value
        into candidate
      from jsonb_array_elements(current_snapshot->'candidates')
      where value->>'preparation_id'
          = output_component->>'preparationId'
        and value->>'revision_id' = output_component->>'revisionId';

      if candidate is null then
        return jsonb_build_object(
          'status', 'rejected',
          'reason', 'candidate_no_longer_eligible',
          'version', target_plan.version
        );
      end if;

      if output_component->>'source' = 'existing_refrigerated' then
        select value
          into inventory_item
        from jsonb_array_elements(current_snapshot->'inventory')
        where value->>'batch_id' = output_component->>'batchId'
          and value->>'preparation_id'
            = output_component->>'preparationId'
          and value->>'content_revision_id'
            = output_component->>'revisionId'
          and value->>'lifecycle_state' in ('refrigerated', 'thawed')
          and (value->>'deadline_at')::timestamptz
            > (expected_request->>'consume_by')::timestamptz;

        if inventory_item is null then
          return jsonb_build_object(
            'status', 'rejected',
            'reason', 'inventory_no_longer_available',
            'version', target_plan.version
          );
        end if;

        used_count := coalesce(
          (batch_use->>(inventory_item->>'batch_id'))::integer,
          0
        ) + 1;
        if used_count > (inventory_item->>'remaining_portions')::integer then
          return jsonb_build_object(
            'status', 'rejected',
            'reason', 'inventory_no_longer_available',
            'version', target_plan.version
          );
        end if;
        batch_use := jsonb_set(
          batch_use,
          array[inventory_item->>'batch_id'],
          to_jsonb(used_count),
          true
        );
      else
        select value
          into profile
        from jsonb_array_elements(candidate->'refrigerator_profiles')
        where value->>'profile_id' = output_component->>'strategyId'
          and (expected_request->>'consume_by')::timestamptz
            <= p_reference_at
              + make_interval(
                  hours => (value->>'duration_min_hours')::integer
                );

        if profile is null then
          return jsonb_build_object(
            'status', 'rejected',
            'reason', 'storage_strategy_unavailable',
            'version', target_plan.version
          );
        end if;
      end if;
    end loop;
  end loop;

  if target_plan.id is null then
    insert into public.meal_plans (baby_id)
    values (active_baby.id)
    returning meal_plans.* into target_plan;
  end if;

  for output_meal in
    select value
    from jsonb_array_elements(p_output->'plan'->'meals')
  loop
    target_local_date := (output_meal->>'localDate')::date;
    target_meal_slot := output_meal->>'mealSlot';

    select meals.*
      into target_meal
    from public.meals
    where meals.plan_id = target_plan.id
      and meals.local_date = target_local_date
      and meals.meal_slot = target_meal_slot
    for update;

    if target_meal.id is null then
      insert into public.meals (
        plan_id,
        local_date,
        meal_slot,
        status,
        is_locked
      )
      values (
        target_plan.id,
        target_local_date,
        target_meal_slot,
        'planned',
        false
      )
      returning meals.* into target_meal;
    end if;

    if not target_meal.is_locked then
      delete from public.meal_components
      where meal_components.meal_id = target_meal.id
        and not meal_components.is_locked;

      for output_component in
        select value
        from jsonb_array_elements(output_meal->'components')
        order by (value->>'position')::integer
      loop
        if not exists (
          select 1
          from public.meal_components
          where meal_components.meal_id = target_meal.id
            and meal_components.position
              = (output_component->>'position')::integer + 1
            and meal_components.is_locked
        ) then
          insert into public.meal_components (
            meal_id,
            preparation_id,
            revision_id,
            position,
            is_locked
          )
          values (
            target_meal.id,
            output_component->>'preparationId',
            output_component->>'revisionId',
            (output_component->>'position')::integer + 1,
            false
          );
        end if;
      end loop;
    end if;
  end loop;

  with canonical_meals as (
    select
      meal.value as source_meal,
      jsonb_build_object(
        'mealId', meal.value->>'mealId',
        'localDate', meal.value->>'localDate',
        'mealSlot', meal.value->>'mealSlot',
        'components', (
          select jsonb_agg(
            jsonb_strip_nulls(
              jsonb_build_object(
                'position', public.try_integer(component.value->>'position'),
                'preparationId', component.value->>'preparationId',
                'revisionId', component.value->>'revisionId',
                'foodId', (
                  select current_candidate.value->>'food_id'
                  from jsonb_array_elements(
                    current_snapshot->'candidates'
                  ) as current_candidate
                  where current_candidate.value->>'preparation_id'
                      = component.value->>'preparationId'
                    and current_candidate.value->>'revision_id'
                      = component.value->>'revisionId'
                ),
                'source', component.value->>'source',
                'batchId', component.value->>'batchId',
                'strategyId', component.value->>'strategyId',
                'reasonCodes', to_jsonb(
                  array_remove(
                    array[
                      case when exists (
                        select 1
                        from jsonb_array_elements(
                          current_snapshot->'meal_requests'
                        ) as request
                        cross join lateral jsonb_array_elements(
                          request.value->'locked_components'
                        ) as locked
                        where request.value->>'meal_id'
                            = meal.value->>'mealId'
                          and public.try_integer(locked.value->>'position')
                            = public.try_integer(
                                component.value->>'position'
                              )
                          and locked.value->>'preparation_id'
                            = component.value->>'preparationId'
                          and locked.value->>'revision_id'
                            = component.value->>'revisionId'
                      ) then 'locked_by_caregiver' end,
                      case
                        when component.value->>'source'
                          = 'existing_refrigerated'
                          then 'uses_expiring_refrigerated_inventory'
                      end,
                      case when exists (
                        select 1
                        from jsonb_array_elements(
                          current_snapshot->'feeding'->'foods'
                        ) as current_food
                        where current_food.value->>'id' = (
                          select current_candidate.value->>'food_id'
                          from jsonb_array_elements(
                            current_snapshot->'candidates'
                          ) as current_candidate
                          where current_candidate.value->>'preparation_id'
                              = component.value->>'preparationId'
                            and current_candidate.value->>'revision_id'
                              = component.value->>'revisionId'
                        )
                          and current_food.value->>'exposure_state'
                            = 'not_tried'
                      ) and exists (
                        select 1
                        from jsonb_array_elements(
                          meal.value->'components'
                        ) as paired_component
                        join lateral jsonb_array_elements(
                          current_snapshot->'candidates'
                        ) as paired_candidate on
                          paired_candidate.value->>'preparation_id'
                            = paired_component.value->>'preparationId'
                          and paired_candidate.value->>'revision_id'
                            = paired_component.value->>'revisionId'
                        join lateral jsonb_array_elements(
                          current_snapshot->'feeding'->'foods'
                        ) as paired_food on
                          paired_food.value->>'id'
                            = paired_candidate.value->>'food_id'
                        where public.try_integer(
                          paired_component.value->>'position'
                        ) <> public.try_integer(
                          component.value->>'position'
                        )
                          and paired_food.value->>'exposure_state'
                            in ('liked', 'neutral', 'disliked')
                      ) then 'pairs_new_with_familiar' end,
                      case when (
                        select count(*)
                        from jsonb_array_elements(
                          p_output->'plan'->'meals'
                        ) as compared_meal
                        cross join lateral jsonb_array_elements(
                          compared_meal.value->'components'
                        ) as compared_component
                        where compared_component.value->>'preparationId'
                          = component.value->>'preparationId'
                      ) > 1 then 'reuses_preparation' end,
                      case when (
                        select count(distinct compared_candidate.value->>'food_id')
                        from jsonb_array_elements(
                          p_output->'plan'->'meals'
                        ) as compared_meal
                        cross join lateral jsonb_array_elements(
                          compared_meal.value->'components'
                        ) as compared_component
                        join lateral jsonb_array_elements(
                          current_snapshot->'candidates'
                        ) as compared_candidate on
                          compared_candidate.value->>'preparation_id'
                            = compared_component.value->>'preparationId'
                          and compared_candidate.value->>'revision_id'
                            = compared_component.value->>'revisionId'
                      ) > 1 then 'adds_variety' end,
                      case when exists (
                        select 1
                        from jsonb_array_elements(
                          current_snapshot->'feeding'->'foods'
                        ) as food
                        where food.value->>'id' = (
                          select current_candidate.value->>'food_id'
                          from jsonb_array_elements(
                            current_snapshot->'candidates'
                          ) as current_candidate
                          where current_candidate.value->>'preparation_id'
                              = component.value->>'preparationId'
                            and current_candidate.value->>'revision_id'
                              = component.value->>'revisionId'
                        )
                          and (food.value->>'is_quick_backup')::boolean
                      ) then 'uses_available_quick_backup' end,
                      case
                        when component.value->>'source' = 'new_preparation'
                          then 'requires_new_preparation'
                      end
                    ]::text[],
                    null
                  )
                )
              )
            )
            order by public.try_integer(component.value->>'position')
          )
          from jsonb_array_elements(
            meal.value->'components'
          ) as component
        )
      ) as canonical_meal
    from jsonb_array_elements(p_output->'plan'->'meals') as meal
  )
  select jsonb_build_object(
    'meals',
    jsonb_agg(
      canonical_meal
      order by source_meal->>'localDate', source_meal->>'mealSlot'
    )
  )
    into canonical_plan
  from canonical_meals;

  select coalesce(
    array_agg(distinct rule_id order by rule_id),
    '{}'::text[]
  )
    into canonical_rule_revision_ids
  from (
    select case
      when component.value->>'source' = 'new_preparation'
        then component.value->>'strategyId'
      else (
        select current_inventory.value->>'rule_profile_id'
        from jsonb_array_elements(
          current_snapshot->'inventory'
        ) as current_inventory
        where current_inventory.value->>'batch_id'
          = component.value->>'batchId'
      )
    end as rule_id
    from jsonb_array_elements(
      canonical_plan->'meals'
    ) as meal
    cross join lateral jsonb_array_elements(
      meal.value->'components'
    ) as component
  ) as applied_rules
  where rule_id is not null
    and btrim(rule_id) <> '';

  select jsonb_build_object(
    'meals',
    jsonb_agg(
      jsonb_build_object(
        'mealId', meal.value->>'mealId',
        'components', (
          select jsonb_agg(
            jsonb_build_object(
              'position', public.try_integer(component.value->>'position'),
              'preparationId', component.value->>'preparationId',
              'messages', (
                select coalesce(
                  jsonb_agg(
                    case reason.value
                      when 'locked_by_caregiver'
                        then 'Keeps a choice you locked.'
                      when 'uses_expiring_refrigerated_inventory'
                        then 'Uses a prepared portion while it is still available.'
                      when 'pairs_new_with_familiar'
                        then 'Pairs a newer food with a familiar option.'
                      when 'reuses_preparation'
                        then 'Reuses a preparation to keep the week practical.'
                      when 'adds_variety'
                        then 'Adds variety without changing safety requirements.'
                      when 'uses_available_quick_backup'
                        then 'Uses a quick backup marked available.'
                      when 'matches_preparation_preference'
                        then 'Fits the preparation-time preference in the profile.'
                      when 'requires_new_preparation'
                        then 'Adds preparation work because no valid portion is available.'
                    end
                    order by reason.ordinality
                  ),
                  '[]'::jsonb
                )
                from jsonb_array_elements_text(
                  component.value->'reasonCodes'
                ) with ordinality as reason(value, ordinality)
              )
            )
            order by public.try_integer(component.value->>'position')
          )
          from jsonb_array_elements(
            meal.value->'components'
          ) as component
        )
      )
      order by meal.value->>'localDate', meal.value->>'mealSlot'
    )
  )
    into canonical_explanations
  from jsonb_array_elements(canonical_plan->'meals') as meal;

  canonical_hash := md5(
    p_input_token
    || canonical_plan::text
    || to_jsonb(canonical_rule_revision_ids)::text
  );
  canonical_output := jsonb_build_object(
    'status', 'feasible',
    'reproducibilityHash', canonical_hash,
    'ruleRevisionIds', to_jsonb(canonical_rule_revision_ids),
    'plan', canonical_plan,
    'explanations', canonical_explanations
  );

  new_version := target_plan.version + 1;
  update public.meal_plans
  set version = new_version,
      planner_reproducibility_hash = canonical_hash,
      planner_input_token = p_input_token,
      planner_rule_revision_ids = canonical_rule_revision_ids,
      planner_explanations = canonical_explanations,
      planner_window_start = (current_snapshot->>'window_start')::date,
      planner_generated_version = new_version,
      generated_at = statement_timestamp()
  where meal_plans.id = target_plan.id;

  result := jsonb_build_object(
    'status', 'committed',
    'plan_id', target_plan.id,
    'version', new_version,
    'reproducibility_hash', canonical_hash
  );

  insert into public.planner_generation_events (
    plan_id,
    version,
    operation,
    input_token,
    request_fingerprint,
    reference_at,
    reproducibility_hash,
    rule_revision_ids,
    output,
    result,
    actor_user_id,
    idempotency_key
  )
  values (
    target_plan.id,
    new_version,
    case when target_plan.version = 0 then 'generate' else 'regenerate' end,
    p_input_token,
    request_fingerprint,
    p_reference_at,
    canonical_hash,
    canonical_rule_revision_ids,
    canonical_output,
    result,
    caller_id,
    p_idempotency_key
  );

  return result;
exception
  when unique_violation or check_violation or foreign_key_violation then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'invalid_generated_output',
      'version', coalesce(target_plan.version, 0)
    );
end;
$$;

create or replace function public.get_planner_generation_metadata()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  metadata record;
begin
  if caller_id is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  select
    meal_plans.id as plan_id,
    meal_plans.planner_window_start as window_start,
    meal_plans.planner_generated_version as generated_version,
    meal_plans.version as current_version,
    meal_plans.planner_reproducibility_hash,
    meal_plans.planner_explanations,
    meal_plans.generated_at
    into metadata
  from public.meal_plans
  join public.babies on babies.id = meal_plans.baby_id
  join public.user_profiles
    on user_profiles.household_id = babies.household_id
  where babies.is_active
    and user_profiles.user_id = caller_id
    and meal_plans.generated_at is not null
  order by meal_plans.generated_at desc
  limit 1;

  if metadata.plan_id is null then
    return jsonb_build_object('status', 'none');
  end if;

  return jsonb_build_object(
    'status', case
      when metadata.generated_version = metadata.current_version then 'ready'
      else 'stale'
    end,
    'plan_id', metadata.plan_id,
    'window_start', metadata.window_start,
    'version', metadata.generated_version,
    'reproducibility_hash', metadata.planner_reproducibility_hash,
    'explanations', metadata.planner_explanations,
    'generated_at', metadata.generated_at
  );
end;
$$;

revoke all on function public.get_planner_generation_snapshot(timestamptz)
  from public, anon, authenticated;
revoke all on function public.commit_generated_week(
  bigint,
  text,
  timestamptz,
  jsonb,
  uuid
) from public, anon, authenticated;
revoke all on function public.get_planner_generation_metadata()
  from public, anon, authenticated;

grant execute on function public.get_planner_generation_snapshot(timestamptz)
  to authenticated;
grant execute on function public.commit_generated_week(
  bigint,
  text,
  timestamptz,
  jsonb,
  uuid
) to authenticated;
grant execute on function public.get_planner_generation_metadata()
  to authenticated;

alter table public.batch_events
  drop constraint batch_events_event_type_check,
  drop constraint batch_events_portion_delta_check;

alter table public.batch_events
  add column meal_component_id uuid
    references public.meal_components (id),
  add column idempotency_key uuid,
  add column resulting_portions integer
    check (resulting_portions between 0 and 99),
  add constraint batch_events_supported_transition_check
    check (
      (
        event_type = 'prepared_or_opened'
        and portion_delta between 1 and 99
        and meal_component_id is null
        and idempotency_key is null
        and resulting_portions is null
      )
      or
      (
        event_type = 'served'
        and portion_delta = -1
        and meal_component_id is not null
        and idempotency_key is not null
        and resulting_portions is not null
      )
    );

create unique index batch_events_serve_idempotency_key_idx
  on public.batch_events (idempotency_key)
  where idempotency_key is not null;

create unique index batch_events_served_component_idx
  on public.batch_events (meal_component_id)
  where event_type = 'served';

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
  trusted_now timestamptz;
  candidate_batch record;
  target_batch record;
  target_component record;
  existing_event record;
  prior_component_event record;
  locked_baby_id uuid;
  locked_revision_id text;
  eligibility jsonb;
  ledger_portions integer;
  inserted_event_id uuid;
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

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_idempotency_key::text, 0)
  );

  select
    batches.id,
    batches.baby_id,
    batches.preparation_id,
    batches.content_revision_id
    into candidate_batch
  from public.batches
  join public.babies on babies.id = batches.baby_id
  join public.user_profiles
    on user_profiles.household_id = babies.household_id
  where batches.id = p_batch_id
    and babies.is_active
    and user_profiles.user_id = caller_id;

  if candidate_batch.id is null then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'batch_unavailable'
    );
  end if;

  select babies.id
    into locked_baby_id
  from public.babies
  join public.user_profiles
    on user_profiles.household_id = babies.household_id
  where babies.id = candidate_batch.baby_id
    and babies.is_active
    and user_profiles.user_id = caller_id
  for update of babies;

  if locked_baby_id is null then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'batch_unavailable'
    );
  end if;

  select
    meal_components.id,
    meal_components.preparation_id,
    meal_components.revision_id,
    preparations.slug as preparation_slug,
    meal_plans.baby_id
    into target_component
  from public.meal_components
  join public.meals on meals.id = meal_components.meal_id
  join public.meal_plans on meal_plans.id = meals.plan_id
  join public.preparations
    on preparations.id = meal_components.preparation_id
  where meal_components.id = p_meal_component_id
    and meal_plans.baby_id = candidate_batch.baby_id
    and meal_components.preparation_id = candidate_batch.preparation_id
    and meal_components.revision_id = candidate_batch.content_revision_id
  for update of meal_components;

  if target_component.id is null then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'planned_component_unavailable'
    );
  end if;

  select content_revisions.id
    into locked_revision_id
  from public.content_revisions
  where content_revisions.id = candidate_batch.content_revision_id
  for update;

  if locked_revision_id is null then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'preparation_not_approved'
    );
  end if;

  select
    batches.id,
    batches.baby_id,
    batches.preparation_id,
    batches.content_revision_id,
    batches.storage_location,
    batch_deadlines.deadline_at
    into target_batch
  from public.batches
  join public.batch_deadlines
    on batch_deadlines.batch_id = batches.id
  where batches.id = candidate_batch.id
    and batches.baby_id = candidate_batch.baby_id
    and batches.preparation_id = candidate_batch.preparation_id
    and batches.content_revision_id = candidate_batch.content_revision_id
  for update of batches;

  if target_batch.id is null then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'batch_unavailable'
    );
  end if;

  select
    batch_events.id,
    batch_events.batch_id,
    batch_events.meal_component_id,
    batch_events.actor_user_id,
    batch_events.resulting_portions,
    batch_events.occurred_at
    into existing_event
  from public.batch_events
  where batch_events.idempotency_key = p_idempotency_key;

  if existing_event.id is not null then
    if existing_event.batch_id = target_batch.id
      and existing_event.meal_component_id = p_meal_component_id
      and existing_event.actor_user_id = caller_id then
      return jsonb_build_object(
        'status', 'served',
        'event_id', existing_event.id,
        'batch_id', existing_event.batch_id,
        'meal_component_id', existing_event.meal_component_id,
        'remaining_portions', existing_event.resulting_portions,
        'served_at', existing_event.occurred_at,
        'idempotent_retry', true
      );
    end if;

    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'idempotency_key_conflict'
    );
  end if;

  select batch_events.id
    into prior_component_event
  from public.batch_events
  where batch_events.meal_component_id = p_meal_component_id
    and batch_events.event_type = 'served';

  if prior_component_event.id is not null then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'component_already_served'
    );
  end if;

  if not exists (
    select 1
    from public.current_published_preparations() as published
    where published.preparation_id = target_component.preparation_id
      and published.revision_id = target_component.revision_id
  ) then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'preparation_not_approved'
    );
  end if;

  eligibility := public.get_preparation_eligibility(
    target_component.preparation_slug
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

  if target_batch.storage_location <> 'refrigerator' then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'batch_lifecycle_unavailable'
    );
  end if;

  ledger_portions := public.reconciled_batch_portions(target_batch.id);
  if ledger_portions <= 0 then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'batch_depleted'
    );
  end if;

  trusted_now := clock_timestamp();
  if target_batch.deadline_at <= trusted_now then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'batch_expired'
    );
  end if;

  insert into public.batch_events (
    batch_id,
    event_type,
    occurred_at,
    actor_user_id,
    portion_delta,
    meal_component_id,
    idempotency_key,
    resulting_portions
  ) values (
    target_batch.id,
    'served',
    trusted_now,
    caller_id,
    -1,
    p_meal_component_id,
    p_idempotency_key,
    ledger_portions - 1
  )
  returning batch_events.id into inserted_event_id;

  update public.batches
  set remaining_portions = ledger_portions - 1
  where batches.id = target_batch.id;

  return jsonb_build_object(
    'status', 'served',
    'event_id', inserted_event_id,
    'batch_id', target_batch.id,
    'meal_component_id', p_meal_component_id,
    'remaining_portions', ledger_portions - 1,
    'served_at', trusted_now,
    'idempotent_retry', false
  );
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

create or replace function public.get_kitchen_inventory(
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
  active_baby record;
  reference_at timestamptz := coalesce(
    p_reference_at,
    statement_timestamp()
  );
begin
  if caller_id is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  select babies.id, babies.time_zone
    into active_baby
  from public.babies
  join public.user_profiles
    on user_profiles.household_id = babies.household_id
  where babies.is_active
    and user_profiles.user_id = caller_id;

  if active_baby.id is null then
    return jsonb_build_object(
      'status', 'unavailable',
      'reason', 'profile_unavailable',
      'items', '[]'::jsonb
    );
  end if;

  return jsonb_build_object(
    'status', 'ready',
    'baby_id', active_baby.id,
    'time_zone', active_baby.time_zone,
    'items', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'batch_id', batches.id,
            'preparation_id', batches.preparation_id,
            'content_revision_id', batches.content_revision_id,
            'preparation_name', preparations.name,
            'storage_location', batches.storage_location,
            'remaining_portions',
              public.reconciled_batch_portions(batches.id),
            'prepared_or_opened_at', batches.prepared_or_opened_at,
            'deadline_at', batch_deadlines.deadline_at,
            'storage_status', case
              when public.reconciled_batch_portions(batches.id) = 0
                then 'depleted'
              when batch_deadlines.deadline_at <= reference_at
                then 'expired'
              when batch_deadlines.deadline_at
                <= reference_at + interval '24 hours'
                then 'use_today'
              else 'ready'
            end,
            'rule_profile_id', batch_deadlines.rule_profile_id,
            'storage_rule_id', batch_deadlines.storage_rule_id,
            'guidance', storage_rules.guidance,
            'reviewed_at', storage_rule_profiles.reviewed_at,
            'source_title', sources.title,
            'source_url', sources.url,
            'applied_duration_hours',
              batch_deadlines.applied_duration_hours,
            'reviewed_duration_range_hours', jsonb_build_object(
              'minimum',
                batch_deadlines.reviewed_duration_min_hours,
              'maximum',
                batch_deadlines.reviewed_duration_max_hours
            ),
            'projection_matches_ledger',
              batches.remaining_portions =
                public.reconciled_batch_portions(batches.id)
          )
          order by batch_deadlines.deadline_at, batches.id
        ),
        '[]'::jsonb
      )
      from public.batches
      join public.preparations
        on preparations.id = batches.preparation_id
      join public.batch_deadlines
        on batch_deadlines.batch_id = batches.id
      join public.storage_rule_profiles
        on storage_rule_profiles.id = batch_deadlines.rule_profile_id
      join public.storage_rules
        on storage_rules.id = batch_deadlines.storage_rule_id
        and storage_rules.revision_id =
          batch_deadlines.content_revision_id
      join public.sources
        on sources.id = storage_rule_profiles.source_id
      where batches.baby_id = active_baby.id
        and batches.storage_location = 'refrigerator'
    )
  );
end;
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
                        'food_name', foods.name,
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
                    from public.meals
                    join public.meal_components
                      on meal_components.meal_id = meals.id
                    join public.preparations
                      on preparations.id = meal_components.preparation_id
                    join public.foods
                      on foods.id = preparations.food_id
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

revoke all on function public.serve_planned_portion(uuid, uuid, uuid)
  from public, anon;
revoke all on function public.get_today_meal()
  from public, anon;

grant execute on function public.serve_planned_portion(uuid, uuid, uuid)
  to authenticated;
grant execute on function public.get_today_meal()
  to authenticated;

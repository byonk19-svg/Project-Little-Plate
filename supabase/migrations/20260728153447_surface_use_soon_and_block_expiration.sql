alter table public.batch_events
  drop constraint batch_events_supported_transition_check;

alter table public.batch_events
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
      or
      (
        event_type = 'discarded'
        and portion_delta between -99 and -1
        and meal_component_id is null
        and idempotency_key is not null
        and resulting_portions = 0
      )
    );

create unique index batch_events_discarded_batch_idx
  on public.batch_events (batch_id)
  where event_type = 'discarded';

create or replace function public.discard_batch(
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
  candidate_batch record;
  target_batch record;
  existing_event record;
  prior_discard_id uuid;
  locked_baby_id uuid;
  ledger_portions integer;
  discarded_at timestamptz;
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
    batches.baby_id
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
    batches.id,
    batches.baby_id
    into target_batch
  from public.batches
  where batches.id = candidate_batch.id
    and batches.baby_id = candidate_batch.baby_id
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
    batch_events.event_type,
    batch_events.actor_user_id,
    batch_events.occurred_at
    into existing_event
  from public.batch_events
  where batch_events.idempotency_key = p_idempotency_key;

  if existing_event.id is not null then
    if existing_event.batch_id = target_batch.id
      and existing_event.event_type = 'discarded'
      and existing_event.actor_user_id = caller_id then
      return jsonb_build_object(
        'status', 'discarded',
        'event_id', existing_event.id,
        'batch_id', existing_event.batch_id,
        'remaining_portions', 0,
        'discarded_at', existing_event.occurred_at,
        'idempotent_retry', true
      );
    end if;

    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'idempotency_key_conflict'
    );
  end if;

  select batch_events.id
    into prior_discard_id
  from public.batch_events
  where batch_events.batch_id = target_batch.id
    and batch_events.event_type = 'discarded';

  if prior_discard_id is not null then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'batch_already_discarded'
    );
  end if;

  ledger_portions := public.reconciled_batch_portions(target_batch.id);
  if ledger_portions <= 0 then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'batch_depleted'
    );
  end if;

  discarded_at := clock_timestamp();
  insert into public.batch_events (
    batch_id,
    event_type,
    occurred_at,
    actor_user_id,
    portion_delta,
    idempotency_key,
    resulting_portions
  ) values (
    target_batch.id,
    'discarded',
    discarded_at,
    caller_id,
    -ledger_portions,
    p_idempotency_key,
    0
  )
  returning batch_events.id into inserted_event_id;

  update public.batches
  set remaining_portions = 0
  where batches.id = target_batch.id;

  return jsonb_build_object(
    'status', 'discarded',
    'event_id', inserted_event_id,
    'batch_id', target_batch.id,
    'remaining_portions', 0,
    'discarded_at', discarded_at,
    'idempotent_retry', false
  );
end;
$$;

drop function public.get_kitchen_inventory(timestamptz);

create or replace function public.get_kitchen_inventory()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  active_baby record;
  reference_at timestamptz := statement_timestamp();
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
        and not exists (
          select 1
          from public.batch_events
          where batch_events.batch_id = batches.id
            and batch_events.event_type = 'discarded'
        )
    )
  );
end;
$$;

create or replace function public.get_use_soon_batches()
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
  today_meal jsonb;
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
      'reason', 'profile_unavailable',
      'items', '[]'::jsonb
    );
  end if;

  today_meal := public.get_today_meal();

  return jsonb_build_object(
    'status', 'ready',
    'baby_id', active_baby.id,
    'time_zone', active_baby.time_zone,
    'items', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'batch_id', candidate.batch_id,
            'preparation_id', candidate.preparation_id,
            'revision_id', candidate.revision_id,
            'preparation_slug', candidate.preparation_slug,
            'preparation_name', candidate.preparation_name,
            'food_name', candidate.food_name,
            'remaining_portions', candidate.remaining_portions,
            'deadline_at', candidate.deadline_at,
            'guidance', candidate.guidance,
            'reviewed_at', candidate.reviewed_at,
            'source_title', candidate.source_title,
            'source_url', candidate.source_url,
            'next_component_id', candidate.next_component_id
          )
          order by candidate.deadline_at, candidate.batch_id
        ),
        '[]'::jsonb
      )
      from (
        select
          batches.id as batch_id,
          batches.preparation_id,
          batches.content_revision_id as revision_id,
          preparations.slug as preparation_slug,
          preparations.name as preparation_name,
          foods.name as food_name,
          public.reconciled_batch_portions(batches.id)
            as remaining_portions,
          batch_deadlines.deadline_at,
          storage_rules.guidance,
          storage_rule_profiles.reviewed_at,
          sources.title as source_title,
          sources.url as source_url,
          next_component.id as next_component_id
        from public.batches
        join public.preparations
          on preparations.id = batches.preparation_id
        join public.foods on foods.id = preparations.food_id
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
        left join lateral (
          select (component->>'component_id')::uuid as id
          from jsonb_array_elements(
            coalesce(today_meal->'components', '[]'::jsonb)
          ) as component
          where component->>'batch_id' = batches.id::text
            and component->>'availability_state' = 'ready'
          limit 1
        ) as next_component on true
        where batches.baby_id = active_baby.id
          and batches.storage_location = 'refrigerator'
          and batch_deadlines.deadline_at > trusted_now
          and batch_deadlines.deadline_at
            <= trusted_now + interval '24 hours'
          and public.reconciled_batch_portions(batches.id) > 0
          and exists (
            select 1
            from public.current_published_preparations() as published
            where published.preparation_id = batches.preparation_id
              and published.revision_id =
                batches.content_revision_id
          )
          and public.get_preparation_eligibility(
            preparations.slug
          )->>'status' = 'eligible'
          and not exists (
            select 1
            from public.batch_events
            where batch_events.batch_id = batches.id
              and batch_events.event_type = 'discarded'
          )
        order by batch_deadlines.deadline_at, batches.id
        limit 3
      ) as candidate
    )
  );
end;
$$;

revoke all on function public.get_kitchen_inventory()
  from public, anon;
revoke all on function public.get_use_soon_batches()
  from public, anon;
revoke all on function public.discard_batch(uuid, uuid)
  from public, anon;

grant execute on function public.get_kitchen_inventory()
  to authenticated;
grant execute on function public.get_use_soon_batches()
  to authenticated;
grant execute on function public.discard_batch(uuid, uuid)
  to authenticated;

create table public.product_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  baby_id uuid references public.babies (id) on delete set null,
  actor_user_id uuid not null,
  event_name text not null check (event_name in (
    'today_opened',
    'meal_choice_timed',
    'serving_outcome',
    'batch_outcome',
    'swap_outcome',
    'quick_backup_outcome',
    'generation_outcome',
    'generation_failed',
    'feedback_submitted'
  )),
  outcome text check (outcome in ('success', 'rejected')),
  reason_code text check (
    reason_code is null
    or reason_code in (
      'unavailable',
      'unexpected_outcome',
      'batch_unavailable',
      'planned_component_unavailable',
      'component_already_served',
      'meal_not_planned',
      'preparation_not_approved',
      'food_restricted',
      'restriction_status_unknown',
      'required_ability_not_observed',
      'eligibility_unavailable',
      'batch_lifecycle_unavailable',
      'batch_expired',
      'batch_depleted',
      'batch_terminal',
      'batch_not_untouched',
      'invalid_batch_transition',
      'transition_rule_unavailable',
      'portion_not_returnable',
      'served_event_unavailable',
      'invalid_correction',
      'batch_already_discarded',
      'storage_rule_missing',
      'storage_rule_ambiguous',
      'storage_location_unsupported',
      'invalid_portion_count',
      'plan_stale',
      'meal_unavailable',
      'component_unavailable',
      'meal_locked',
      'component_locked',
      'meal_already_served',
      'preparation_required',
      'quick_backup_unavailable',
      'meal_component_limit_reached',
      'preparation_already_planned',
      'target_meal_not_empty',
      'source_meal_empty',
      'source_preparation_changed',
      'meal_slot_not_configured',
      'invalid_local_date',
      'invalid_meal_status',
      'nothing_to_undo',
      'undo_state_changed',
      'idempotency_key_conflict',
      'snapshot_unavailable',
      'invalid_snapshot',
      'no_eligible_candidate',
      'locked_component_ineligible',
      'storage_infeasible',
      'planner_input_stale',
      'locked_decision_changed',
      'invalid_generated_output',
      'candidate_no_longer_eligible',
      'inventory_no_longer_available',
      'storage_strategy_unavailable'
    )
  ),
  operation text check (
    operation is null
    or operation in (
      'create',
      'serve',
      'freeze',
      'begin_thaw',
      'mark_thawed',
      'return_untouched',
      'finish',
      'correct',
      'discard',
      'swap_component',
      'swap_meal',
      'use_quick_backup',
      'generate',
      'regenerate'
    )
  ),
  state text check (
    state is null
    or state in (
      'ready',
      'preparation_required',
      'empty',
      'unavailable',
      'serve',
      'prepare'
    )
  ),
  duration_bucket text check (
    duration_bucket is null
    or duration_bucket in (
      'under_10_seconds',
      '10_to_30_seconds',
      'over_30_seconds'
    )
  ),
  workflow text check (
    workflow is null or workflow in ('today', 'week', 'kitchen', 'foods')
  ),
  friction_code text check (
    friction_code is null
    or friction_code in (
      'inventory_inaccurate',
      'answer_not_clear',
      'logging_too_slow',
      'warning_missed',
      'suggestion_impractical',
      'network_or_retry'
    )
  ),
  severity text check (
    severity is null or severity in ('minor', 'blocking')
  ),
  event_key uuid not null,
  occurred_at timestamptz not null default statement_timestamp(),
  unique (household_id, event_name, event_key)
);

create index product_events_household_occurred_idx
  on public.product_events (household_id, occurred_at desc);

alter table public.product_events enable row level security;

create policy "Caregivers can read household product events"
  on public.product_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.user_profiles
      where user_profiles.household_id = product_events.household_id
        and user_profiles.user_id = (select auth.uid())
    )
  );

revoke all on table public.product_events from public, anon, authenticated;
grant select on table public.product_events to authenticated;
grant select, insert on table public.product_events to service_role;

create or replace function public.prevent_product_event_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Product events are append-only'
    using errcode = '55000';
end;
$$;

create trigger product_events_append_only
before update or delete on public.product_events
for each row execute function public.prevent_product_event_changes();

create or replace function public.record_product_event(
  p_event_name text,
  p_event_key uuid,
  p_outcome text default null,
  p_reason_code text default null,
  p_operation text default null,
  p_state text default null,
  p_duration_bucket text default null,
  p_workflow text default null,
  p_friction_code text default null,
  p_severity text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  caller_household_id uuid;
  active_baby_id uuid;
  inserted_id uuid;
begin
  if caller_id is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  select user_profiles.household_id
    into caller_household_id
  from public.user_profiles
  where user_profiles.user_id = caller_id;

  if caller_household_id is null or p_event_key is null then
    return jsonb_build_object('status', 'rejected', 'reason', 'profile_unavailable');
  end if;

  select babies.id
    into active_baby_id
  from public.babies
  where babies.household_id = caller_household_id
    and babies.is_active;

  if not (
    (p_event_name = 'today_opened'
      and p_state in ('ready', 'preparation_required', 'empty', 'unavailable')
      and p_outcome is null and p_reason_code is null
      and p_operation is null and p_duration_bucket is null
      and p_workflow is null and p_friction_code is null and p_severity is null)
    or
    (p_event_name = 'meal_choice_timed'
      and p_state in ('serve', 'prepare')
      and p_duration_bucket in (
        'under_10_seconds', '10_to_30_seconds', 'over_30_seconds'
      )
      and p_outcome is null and p_reason_code is null and p_operation is null
      and p_workflow is null and p_friction_code is null and p_severity is null)
    or
    (p_event_name = 'serving_outcome'
      and p_operation = 'serve'
      and p_outcome in ('success', 'rejected')
      and p_state is null and p_duration_bucket is null
      and p_workflow is null and p_friction_code is null and p_severity is null)
    or
    (p_event_name = 'batch_outcome'
      and p_operation in (
        'create', 'freeze', 'begin_thaw', 'mark_thawed',
        'return_untouched', 'finish', 'correct', 'discard'
      )
      and p_outcome in ('success', 'rejected')
      and p_state is null and p_duration_bucket is null
      and p_workflow is null and p_friction_code is null and p_severity is null)
    or
    (p_event_name = 'swap_outcome'
      and p_operation in ('swap_component', 'swap_meal')
      and p_outcome in ('success', 'rejected')
      and p_state is null and p_duration_bucket is null
      and p_workflow is null and p_friction_code is null and p_severity is null)
    or
    (p_event_name = 'quick_backup_outcome'
      and p_operation = 'use_quick_backup'
      and p_outcome in ('success', 'rejected')
      and p_state is null and p_duration_bucket is null
      and p_workflow is null and p_friction_code is null and p_severity is null)
    or
    (p_event_name = 'generation_outcome'
      and p_operation in ('generate', 'regenerate')
      and p_outcome = 'success'
      and p_reason_code is null
      and p_state is null and p_duration_bucket is null
      and p_workflow is null and p_friction_code is null and p_severity is null)
    or
    (p_event_name = 'generation_failed'
      and p_operation in ('generate', 'regenerate')
      and p_outcome = 'rejected'
      and p_reason_code is not null
      and p_state is null and p_duration_bucket is null
      and p_workflow is null and p_friction_code is null and p_severity is null)
    or
    (p_event_name = 'feedback_submitted'
      and p_workflow in ('today', 'week', 'kitchen', 'foods')
      and p_friction_code in (
        'inventory_inaccurate', 'answer_not_clear', 'logging_too_slow',
        'warning_missed', 'suggestion_impractical', 'network_or_retry'
      )
      and p_severity in ('minor', 'blocking')
      and p_outcome is null and p_reason_code is null
      and p_operation is null and p_state is null and p_duration_bucket is null)
  ) or (
    p_outcome = 'success' and p_reason_code is not null
  ) or (
    p_outcome = 'rejected' and p_reason_code is null
  ) then
    return jsonb_build_object('status', 'rejected', 'reason', 'invalid_event');
  end if;

  insert into public.product_events (
    household_id,
    baby_id,
    actor_user_id,
    event_name,
    outcome,
    reason_code,
    operation,
    state,
    duration_bucket,
    workflow,
    friction_code,
    severity,
    event_key
  )
  values (
    caller_household_id,
    active_baby_id,
    caller_id,
    p_event_name,
    p_outcome,
    p_reason_code,
    p_operation,
    p_state,
    p_duration_bucket,
    p_workflow,
    p_friction_code,
    p_severity,
    p_event_key
  )
  on conflict (household_id, event_name, event_key) do nothing
  returning id into inserted_id;

  return jsonb_build_object(
    'status', 'recorded',
    'duplicate', inserted_id is null
  );
exception
  when check_violation then
    return jsonb_build_object('status', 'rejected', 'reason', 'invalid_event');
end;
$$;

create or replace function public.get_inventory_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  caller_household_id uuid;
  active_baby_id uuid;
begin
  if caller_id is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  select user_profiles.household_id
    into caller_household_id
  from public.user_profiles
  where user_profiles.user_id = caller_id;

  if caller_household_id is null then
    return jsonb_build_object('status', 'unavailable');
  end if;

  select babies.id
    into active_baby_id
  from public.babies
  where babies.household_id = caller_household_id
    and babies.is_active;

  if active_baby_id is null then
    return jsonb_build_object('status', 'unavailable');
  end if;

  return jsonb_build_object(
    'status', 'ready',
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'batch_id', batches.id,
          'lifecycle_state', batches.lifecycle_state,
          'remaining_portions', batches.remaining_portions,
          'ledger_portions', public.reconciled_batch_portions(batches.id),
          'projection_matches_ledger',
            batches.remaining_portions
              = public.reconciled_batch_portions(batches.id),
          'last_event_at', latest.occurred_at
        )
        order by latest.occurred_at, batches.id
      )
      from public.batches
      cross join lateral (
        select max(batch_events.occurred_at) as occurred_at
        from public.batch_events
        where batch_events.batch_id = batches.id
      ) as latest
      where batches.baby_id = active_baby_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.record_product_event(
  text, uuid, text, text, text, text, text, text, text, text
) from public, anon, authenticated;
revoke all on function public.get_inventory_health()
  from public, anon, authenticated;
grant execute on function public.record_product_event(
  text, uuid, text, text, text, text, text, text, text, text
) to authenticated;
grant execute on function public.get_inventory_health() to authenticated;

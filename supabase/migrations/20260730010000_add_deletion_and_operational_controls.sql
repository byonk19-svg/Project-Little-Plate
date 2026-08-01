create or replace function public.prevent_batch_history_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
    and current_user = 'postgres'
    and current_setting(
      'little_plate.account_deletion_cascade',
      true
    ) = 'allowed' then
    return old;
  end if;

  raise exception 'Batch events and deadlines are append-only'
    using errcode = '55000';
end;
$$;

create or replace function public.prevent_reaction_event_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
    and current_user = 'postgres'
    and current_setting(
      'little_plate.account_deletion_cascade',
      true
    ) = 'allowed' then
    return old;
  end if;

  raise exception 'Reaction history is append-only'
    using errcode = '55000';
end;
$$;

create or replace function public.prevent_derived_work_event_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
    and current_user = 'postgres'
    and current_setting(
      'little_plate.account_deletion_cascade',
      true
    ) = 'allowed' then
    return old;
  end if;

  raise exception 'Derived work history is append-only'
    using errcode = '55000';
end;
$$;

create or replace function public.prevent_planner_generation_event_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
    and current_user = 'postgres'
    and current_setting(
      'little_plate.account_deletion_cascade',
      true
    ) = 'allowed' then
    return old;
  end if;

  raise exception 'Planner generation events are append-only'
    using errcode = '55000';
end;
$$;

create or replace function public.prevent_product_event_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
    and current_user = 'postgres'
    and current_setting(
      'little_plate.account_deletion_cascade',
      true
    ) = 'allowed' then
    return old;
  end if;

  raise exception 'Product events are append-only'
    using errcode = '55000';
end;
$$;

create or replace function public.delete_caregiver_account(
  p_confirmation text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  caller_household_id uuid;
  household_caregiver_count integer;
begin
  if caller_id is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  if p_idempotency_key is null then
    raise exception 'An idempotency key is required'
      using errcode = '22023';
  end if;

  if p_confirmation is distinct from 'DELETE' then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'confirmation_required'
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(caller_id::text, 0)
  );

  select user_profiles.household_id
    into caller_household_id
  from public.user_profiles
  where user_profiles.user_id = caller_id
  for update;

  if caller_household_id is null then
    if exists (
      select 1
      from auth.users
      where users.id = caller_id
    ) then
      delete from auth.users where users.id = caller_id;
      return jsonb_build_object('status', 'deleted');
    end if;

    return jsonb_build_object('status', 'already_deleted');
  end if;

  select count(*)
    into household_caregiver_count
  from public.user_profiles
  where user_profiles.household_id = caller_household_id;

  if household_caregiver_count <> 1 then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'shared_household_requires_support'
    );
  end if;

  perform pg_catalog.set_config(
    'little_plate.account_deletion_cascade',
    'allowed',
    true
  );

  delete from public.households
  where households.id = caller_household_id;

  delete from auth.users
  where users.id = caller_id;

  return jsonb_build_object('status', 'deleted');
end;
$$;

revoke all on function public.delete_caregiver_account(text, uuid)
  from public, anon;
grant execute on function public.delete_caregiver_account(text, uuid)
  to authenticated;

create table public.operational_controls (
  control_key text primary key
    check (
      control_key in ('automatic_generation', 'content_publication')
    ),
  is_disabled boolean not null,
  incident_reference text,
  reason text,
  changed_at timestamptz not null default statement_timestamp(),
  check (
    (not is_disabled)
    or (
      incident_reference is not null
      and char_length(btrim(incident_reference)) between 1 and 120
      and reason is not null
      and char_length(btrim(reason)) between 1 and 500
    )
  )
);

insert into public.operational_controls (
  control_key,
  is_disabled
)
values
  ('automatic_generation', false),
  ('content_publication', false);

create table public.operator_action_events (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null unique,
  action_kind text not null
    check (action_kind in ('retire_content', 'set_operational_control')),
  target_key text not null check (btrim(target_key) <> ''),
  requested_state boolean,
  incident_reference text not null
    check (char_length(btrim(incident_reference)) between 1 and 120),
  reason text not null
    check (char_length(btrim(reason)) between 1 and 500),
  result jsonb not null,
  occurred_at timestamptz not null default statement_timestamp()
);

alter table public.operational_controls enable row level security;
alter table public.operator_action_events enable row level security;

revoke all on table public.operational_controls
  from public, anon, authenticated;
revoke all on table public.operator_action_events
  from public, anon, authenticated;
grant select on table public.operational_controls to service_role;
grant select on table public.operator_action_events to service_role;

create or replace function public.prevent_operator_action_event_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Operator action events are append-only'
    using errcode = '55000';
end;
$$;

create trigger operator_action_events_append_only
before update or delete on public.operator_action_events
for each row execute function public.prevent_operator_action_event_changes();

create function public.lock_operational_control(p_control_key text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  control_disabled boolean;
begin
  select operational_controls.is_disabled
    into control_disabled
  from public.operational_controls
  where operational_controls.control_key = p_control_key
  for share;

  if not found then
    raise exception 'Required operational control is unavailable'
      using errcode = '55000';
  end if;

  return control_disabled;
end;
$$;

revoke all on function public.lock_operational_control(text)
  from public, anon, authenticated, service_role;

create or replace function public.emergency_retire_content_revision(
  p_revision_id text,
  p_incident_reference text,
  p_reason text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_event public.operator_action_events%rowtype;
  normalized_incident_reference text :=
    nullif(pg_catalog.btrim(p_incident_reference), '');
  normalized_reason text := nullif(pg_catalog.btrim(p_reason), '');
  result jsonb;
begin
  if p_revision_id is null
    or btrim(p_revision_id) = ''
    or normalized_incident_reference is null
    or char_length(normalized_incident_reference) > 120
    or normalized_reason is null
    or char_length(normalized_reason) > 500
    or p_idempotency_key is null then
    raise exception 'Complete retirement details are required'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_idempotency_key::text, 16)
  );

  select operator_action_events.*
    into existing_event
  from public.operator_action_events
  where operator_action_events.idempotency_key = p_idempotency_key;

  if existing_event.id is not null then
    if existing_event.action_kind <> 'retire_content'
      or existing_event.target_key <> p_revision_id
      or existing_event.incident_reference <> normalized_incident_reference
      or existing_event.reason <> normalized_reason then
      raise exception 'Idempotency key was reused with different details'
        using errcode = '22023';
    end if;
    return existing_event.result;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_revision_id, 0)
  );

  perform 1
  from public.operational_controls
  where operational_controls.control_key = 'content_publication'
  for update;

  if not found then
    raise exception 'Required operational control is unavailable'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from public.content_revisions
    where content_revisions.id = p_revision_id
      and content_revisions.status = 'approved'
  ) then
    raise exception 'Only an approved content revision can be retired'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.content_retirements
    where content_retirements.revision_id = p_revision_id
  ) then
    result := jsonb_build_object(
      'status', 'already_retired',
      'revision_id', p_revision_id
    );
  else
    insert into public.content_retirements (
      revision_id,
      retired_at,
      reason
    )
    values (
      p_revision_id,
      current_date,
      normalized_reason
    );
    result := jsonb_build_object(
      'status', 'retired',
      'revision_id', p_revision_id
    );
  end if;

  insert into public.operator_action_events (
    idempotency_key,
    action_kind,
    target_key,
    incident_reference,
    reason,
    result
  )
  values (
    p_idempotency_key,
    'retire_content',
    p_revision_id,
    normalized_incident_reference,
    normalized_reason,
    result
  );

  return result;
end;
$$;

create or replace function public.set_operational_control(
  p_control_key text,
  p_disabled boolean,
  p_incident_reference text,
  p_reason text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_event public.operator_action_events%rowtype;
  normalized_incident_reference text :=
    nullif(pg_catalog.btrim(p_incident_reference), '');
  normalized_reason text := nullif(pg_catalog.btrim(p_reason), '');
  result jsonb;
  updated_rows integer;
begin
  if p_control_key is distinct from 'automatic_generation'
    or p_disabled is null
    or normalized_incident_reference is null
    or char_length(normalized_incident_reference) > 120
    or normalized_reason is null
    or char_length(normalized_reason) > 500
    or p_idempotency_key is null then
    raise exception 'Complete operational control details are required'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_idempotency_key::text, 16)
  );

  select operator_action_events.*
    into existing_event
  from public.operator_action_events
  where operator_action_events.idempotency_key = p_idempotency_key;

  if existing_event.id is not null then
    if existing_event.action_kind <> 'set_operational_control'
      or existing_event.target_key <> p_control_key
      or existing_event.requested_state is distinct from p_disabled
      or existing_event.incident_reference <> normalized_incident_reference
      or existing_event.reason <> normalized_reason then
      raise exception 'Idempotency key was reused with different details'
        using errcode = '22023';
    end if;
    return existing_event.result;
  end if;

  update public.operational_controls
  set is_disabled = p_disabled,
      incident_reference = normalized_incident_reference,
      reason = normalized_reason,
      changed_at = statement_timestamp()
  where operational_controls.control_key = p_control_key;

  get diagnostics updated_rows = row_count;
  if updated_rows <> 1 then
    raise exception 'Required operational control is unavailable'
      using errcode = '55000';
  end if;

  result := jsonb_build_object(
    'status', 'updated',
    'control_key', p_control_key,
    'disabled', p_disabled
  );

  insert into public.operator_action_events (
    idempotency_key,
    action_kind,
    target_key,
    requested_state,
    incident_reference,
    reason,
    result
  )
  values (
    p_idempotency_key,
    'set_operational_control',
    p_control_key,
    p_disabled,
    normalized_incident_reference,
    normalized_reason,
    result
  );

  return result;
end;
$$;

revoke all on function public.emergency_retire_content_revision(
  text,
  text,
  text,
  uuid
) from public, anon, authenticated;
revoke all on function public.set_operational_control(
  text,
  boolean,
  text,
  text,
  uuid
) from public, anon, authenticated;
grant execute on function public.emergency_retire_content_revision(
  text,
  text,
  text,
  uuid
) to service_role;
grant execute on function public.set_operational_control(
  text,
  boolean,
  text,
  text,
  uuid
) to service_role;

alter function public.get_planner_generation_snapshot(timestamptz)
  rename to get_planner_generation_snapshot_unchecked;
alter function public.commit_generated_week(
  bigint,
  text,
  timestamptz,
  jsonb,
  uuid
) rename to commit_generated_week_unchecked;

revoke all on function public.get_planner_generation_snapshot_unchecked(
  timestamptz
) from public, anon, authenticated;
revoke all on function public.commit_generated_week_unchecked(
  bigint,
  text,
  timestamptz,
  jsonb,
  uuid
) from public, anon, authenticated;

create function public.get_planner_generation_snapshot(
  p_reference_at timestamptz default statement_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  generation_disabled boolean;
begin
  generation_disabled :=
    public.lock_operational_control('automatic_generation');

  if generation_disabled then
    return jsonb_build_object(
      'status', 'unavailable',
      'reason', 'automatic_generation_disabled'
    );
  end if;

  perform public.lock_operational_control('content_publication');

  return public.get_planner_generation_snapshot_unchecked(p_reference_at);
end;
$$;

create function public.commit_generated_week(
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
  generation_disabled boolean;
begin
  generation_disabled :=
    public.lock_operational_control('automatic_generation');

  if generation_disabled then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'automatic_generation_disabled'
    );
  end if;

  perform public.lock_operational_control('content_publication');

  return public.commit_generated_week_unchecked(
    p_expected_version,
    p_input_token,
    p_reference_at,
    p_output,
    p_idempotency_key
  );
end;
$$;

revoke all on function public.get_planner_generation_snapshot(timestamptz)
  from public, anon;
revoke all on function public.commit_generated_week(
  bigint,
  text,
  timestamptz,
  jsonb,
  uuid
) from public, anon;
grant execute on function public.get_planner_generation_snapshot(timestamptz)
  to authenticated;
grant execute on function public.commit_generated_week(
  bigint,
  text,
  timestamptz,
  jsonb,
  uuid
) to authenticated;

alter function public.plan_preparation_for_tomorrow(uuid, text, text)
  rename to plan_preparation_for_tomorrow_unchecked;
alter function public.edit_manual_week(bigint, text, jsonb, uuid)
  rename to edit_manual_week_unchecked;
alter function public.create_refrigerated_batch(
  uuid,
  timestamptz,
  integer,
  uuid,
  text
) rename to create_refrigerated_batch_unchecked;
alter function public.serve_planned_portion(uuid, uuid, uuid)
  rename to serve_planned_portion_unchecked;
alter function public.perform_batch_transition(uuid, text, jsonb, uuid)
  rename to perform_batch_transition_unchecked;

revoke all on function public.plan_preparation_for_tomorrow_unchecked(
  uuid,
  text,
  text
) from public, anon, authenticated;
revoke all on function public.edit_manual_week_unchecked(
  bigint,
  text,
  jsonb,
  uuid
) from public, anon, authenticated;
revoke all on function public.create_refrigerated_batch_unchecked(
  uuid,
  timestamptz,
  integer,
  uuid,
  text
) from public, anon, authenticated;
revoke all on function public.serve_planned_portion_unchecked(
  uuid,
  uuid,
  uuid
) from public, anon, authenticated;
revoke all on function public.perform_batch_transition_unchecked(
  uuid,
  text,
  jsonb,
  uuid
) from public, anon, authenticated;

create function public.plan_preparation_for_tomorrow(
  p_baby_id uuid,
  p_preparation_slug text,
  p_meal_slot text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.lock_operational_control('content_publication');

  return public.plan_preparation_for_tomorrow_unchecked(
    p_baby_id,
    p_preparation_slug,
    p_meal_slot
  );
end;
$$;

create function public.edit_manual_week(
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
begin
  perform public.lock_operational_control('content_publication');

  return public.edit_manual_week_unchecked(
    p_expected_version,
    p_operation,
    p_payload,
    p_idempotency_key
  );
end;
$$;

create function public.create_refrigerated_batch(
  p_meal_component_id uuid,
  p_prepared_or_opened_at timestamptz,
  p_portion_count integer,
  p_idempotency_key uuid,
  p_storage_location text default 'refrigerator'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.lock_operational_control('content_publication');

  return public.create_refrigerated_batch_unchecked(
    p_meal_component_id,
    p_prepared_or_opened_at,
    p_portion_count,
    p_idempotency_key,
    p_storage_location
  );
end;
$$;

create function public.serve_planned_portion(
  p_meal_component_id uuid,
  p_batch_id uuid,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.lock_operational_control('content_publication');

  return public.serve_planned_portion_unchecked(
    p_meal_component_id,
    p_batch_id,
    p_idempotency_key
  );
end;
$$;

create function public.perform_batch_transition(
  p_batch_id uuid,
  p_transition text,
  p_payload jsonb,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.lock_operational_control('content_publication');

  return public.perform_batch_transition_unchecked(
    p_batch_id,
    p_transition,
    p_payload,
    p_idempotency_key
  );
end;
$$;

revoke all on function public.plan_preparation_for_tomorrow(uuid, text, text)
  from public, anon;
revoke all on function public.edit_manual_week(bigint, text, jsonb, uuid)
  from public, anon;
revoke all on function public.create_refrigerated_batch(
  uuid,
  timestamptz,
  integer,
  uuid,
  text
) from public, anon;
revoke all on function public.serve_planned_portion(uuid, uuid, uuid)
  from public, anon;
revoke all on function public.perform_batch_transition(
  uuid,
  text,
  jsonb,
  uuid
) from public, anon;
grant execute on function public.plan_preparation_for_tomorrow(
  uuid,
  text,
  text
) to authenticated;
grant execute on function public.edit_manual_week(
  bigint,
  text,
  jsonb,
  uuid
) to authenticated;
grant execute on function public.create_refrigerated_batch(
  uuid,
  timestamptz,
  integer,
  uuid,
  text
) to authenticated;
grant execute on function public.serve_planned_portion(uuid, uuid, uuid)
  to authenticated;
grant execute on function public.perform_batch_transition(
  uuid,
  text,
  jsonb,
  uuid
) to authenticated;

-- Current-content reads share the publication barrier so emergency retirement
-- cannot return while an earlier response can still present the retired
-- revision as active guidance.
alter function public.list_published_preparations()
  rename to list_published_preparations_unchecked;
alter function public.get_published_preparation(text)
  rename to get_published_preparation_unchecked;
alter function public.get_feeding_configuration()
  rename to get_feeding_configuration_unchecked;
alter function public.get_preparation_eligibility(text)
  rename to get_preparation_eligibility_unchecked;
alter function public.get_current_week(timestamptz)
  rename to get_current_week_unchecked;
alter function public.get_week_window(date)
  rename to get_week_window_unchecked;
alter function public.get_week_edit_options()
  rename to get_week_edit_options_unchecked;
alter function public.get_today_meal()
  rename to get_today_meal_unchecked;
alter function public.get_kitchen_inventory()
  rename to get_kitchen_inventory_unchecked;
alter function public.get_derived_work_and_groceries()
  rename to get_derived_work_and_groceries_unchecked;
alter function public.get_planning_preparation_inputs()
  rename to get_planning_preparation_inputs_unchecked;

revoke all on function public.list_published_preparations_unchecked()
  from public, anon, authenticated;
revoke all on function public.get_published_preparation_unchecked(text)
  from public, anon, authenticated;
revoke all on function public.get_feeding_configuration_unchecked()
  from public, anon, authenticated;
revoke all on function public.get_preparation_eligibility_unchecked(text)
  from public, anon, authenticated;
revoke all on function public.get_current_week_unchecked(timestamptz)
  from public, anon, authenticated;
revoke all on function public.get_week_window_unchecked(date)
  from public, anon, authenticated;
revoke all on function public.get_week_edit_options_unchecked()
  from public, anon, authenticated;
revoke all on function public.get_today_meal_unchecked()
  from public, anon, authenticated;
revoke all on function public.get_kitchen_inventory_unchecked()
  from public, anon, authenticated;
revoke all on function public.get_derived_work_and_groceries_unchecked()
  from public, anon, authenticated;
revoke all on function public.get_planning_preparation_inputs_unchecked()
  from public, anon, authenticated;

create function public.list_published_preparations()
returns table (
  slug text,
  food_name text,
  preparation_name text,
  storage_support_status text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.lock_operational_control('content_publication');
  return query
    select * from public.list_published_preparations_unchecked();
end;
$$;

create function public.get_published_preparation(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.lock_operational_control('content_publication');
  return public.get_published_preparation_unchecked(p_slug);
end;
$$;

create function public.get_feeding_configuration()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.lock_operational_control('content_publication');
  return public.get_feeding_configuration_unchecked();
end;
$$;

create function public.get_preparation_eligibility(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.lock_operational_control('content_publication');
  return public.get_preparation_eligibility_unchecked(p_slug);
end;
$$;

create function public.get_current_week(
  p_reference_at timestamptz default statement_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.lock_operational_control('content_publication');
  return public.get_current_week_unchecked(p_reference_at);
end;
$$;

create function public.get_week_window(p_window_start date default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.lock_operational_control('content_publication');
  return public.get_week_window_unchecked(p_window_start);
end;
$$;

create function public.get_week_edit_options()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.lock_operational_control('content_publication');
  return public.get_week_edit_options_unchecked();
end;
$$;

create function public.get_today_meal()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.lock_operational_control('content_publication');
  return public.get_today_meal_unchecked();
end;
$$;

create function public.get_kitchen_inventory()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.lock_operational_control('content_publication');
  return public.get_kitchen_inventory_unchecked();
end;
$$;

create function public.get_derived_work_and_groceries()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.lock_operational_control('content_publication');
  return public.get_derived_work_and_groceries_unchecked();
end;
$$;

create function public.get_planning_preparation_inputs()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.lock_operational_control('content_publication');
  return public.get_planning_preparation_inputs_unchecked();
end;
$$;

revoke all on function public.list_published_preparations()
  from public, anon, authenticated;
revoke all on function public.get_published_preparation(text)
  from public, anon, authenticated;
revoke all on function public.get_feeding_configuration()
  from public, anon, authenticated;
revoke all on function public.get_preparation_eligibility(text)
  from public, anon, authenticated;
revoke all on function public.get_current_week(timestamptz)
  from public, anon, authenticated;
revoke all on function public.get_week_window(date)
  from public, anon, authenticated;
revoke all on function public.get_week_edit_options()
  from public, anon, authenticated;
revoke all on function public.get_today_meal()
  from public, anon, authenticated;
revoke all on function public.get_kitchen_inventory()
  from public, anon, authenticated;
revoke all on function public.get_derived_work_and_groceries()
  from public, anon, authenticated;
revoke all on function public.get_planning_preparation_inputs()
  from public, anon, authenticated;

grant execute on function public.list_published_preparations()
  to anon, authenticated;
grant execute on function public.get_published_preparation(text)
  to anon, authenticated;
grant execute on function public.get_feeding_configuration()
  to authenticated;
grant execute on function public.get_preparation_eligibility(text)
  to authenticated;
grant execute on function public.get_current_week(timestamptz)
  to authenticated;
grant execute on function public.get_week_window(date)
  to authenticated;
grant execute on function public.get_week_edit_options()
  to authenticated;
grant execute on function public.get_today_meal()
  to authenticated;
grant execute on function public.get_kitchen_inventory()
  to authenticated;
grant execute on function public.get_derived_work_and_groceries()
  to authenticated;
grant execute on function public.get_planning_preparation_inputs()
  to authenticated;

-- These routines now call publication-locked reads and therefore participate
-- in row locking. Keep their volatility declarations honest for linting and
-- for callers that depend on PostgreSQL's execution guarantees.
alter function public.preview_refrigerated_batch(
  uuid,
  timestamptz,
  text,
  timestamptz
) volatile;
alter function public.get_week_window_unchecked(date) volatile;
alter function public.get_today_meal_unchecked() volatile;
alter function public.get_use_soon_batches() volatile;
alter function public.get_derived_work_and_groceries_unchecked() volatile;
alter function public.get_planner_generation_snapshot_unchecked(timestamptz)
  volatile;
alter function public.get_week_edit_options_unchecked() volatile;
alter function public.get_planning_preparation_inputs_unchecked() volatile;

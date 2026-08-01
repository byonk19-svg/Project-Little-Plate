create table public.preparation_task_dismissals (
  baby_id uuid not null references public.babies (id) on delete cascade,
  plan_version bigint not null check (plan_version >= 0),
  preparation_id text not null references public.preparations (id),
  task_fingerprint text not null check (task_fingerprint ~ '^[0-9a-f]{32}$'),
  actor_user_id uuid not null,
  idempotency_key uuid not null unique,
  dismissed_at timestamptz not null default statement_timestamp(),
  primary key (baby_id, plan_version, preparation_id, task_fingerprint)
);

create table public.food_restriction_versions (
  baby_id uuid not null references public.babies (id) on delete cascade,
  food_id text not null references public.foods (id),
  last_status text,
  semantic_version bigint not null check (semantic_version >= 1),
  primary key (baby_id, food_id)
);

create or replace function public.prevent_food_restriction_identity_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.baby_id is distinct from old.baby_id
    or new.food_id is distinct from old.food_id then
    raise exception
      'Food restriction identity is immutable; delete and insert instead'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger baby_food_restrictions_immutable_identity
before update on public.baby_food_restrictions
for each row
execute function public.prevent_food_restriction_identity_changes();

insert into public.food_restriction_versions (
  baby_id,
  food_id,
  last_status,
  semantic_version
)
select baby_id, food_id, status, 1
from public.baby_food_restrictions;

revoke all on table public.food_restriction_versions
  from public, anon, authenticated;
grant select, insert, update, delete
  on table public.food_restriction_versions to service_role;

create or replace function public.refresh_food_restriction_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_baby_id uuid := case
    when tg_op = 'DELETE' then old.baby_id
    else new.baby_id
  end;
  target_food_id text := case
    when tg_op = 'DELETE' then old.food_id
    else new.food_id
  end;
  current_status text;
  tracked public.food_restriction_versions%rowtype;
begin
  select restrictions.status into current_status
  from public.baby_food_restrictions as restrictions
  where restrictions.baby_id = target_baby_id
    and restrictions.food_id = target_food_id;

  select * into tracked
  from public.food_restriction_versions
  where baby_id = target_baby_id
    and food_id = target_food_id
  for update;

  if tracked.baby_id is null then
    insert into public.food_restriction_versions (
      baby_id, food_id, last_status, semantic_version
    ) values (
      target_baby_id, target_food_id, current_status, 1
    );
  elsif tracked.last_status is distinct from current_status then
    update public.food_restriction_versions
    set
      last_status = current_status,
      semantic_version = semantic_version + 1
    where baby_id = target_baby_id
      and food_id = target_food_id;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.refresh_food_restriction_version()
  from public, anon, authenticated;

create constraint trigger baby_food_restrictions_derived_version
after insert or update or delete on public.baby_food_restrictions
deferrable initially deferred
for each row execute function public.refresh_food_restriction_version();

create table public.derived_grocery_states (
  baby_id uuid not null references public.babies (id) on delete cascade,
  food_id text not null references public.foods (id),
  already_have boolean not null default false,
  is_checked boolean not null default false,
  actor_user_id uuid not null,
  updated_at timestamptz not null default statement_timestamp(),
  primary key (baby_id, food_id)
);

create table public.manual_grocery_items (
  id uuid primary key default gen_random_uuid(),
  baby_id uuid not null references public.babies (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  store_section text not null
    check (char_length(btrim(store_section)) between 1 and 60),
  quantity integer not null check (quantity between 1 and 99),
  is_checked boolean not null default false,
  is_deleted boolean not null default false,
  actor_user_id uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);

create index manual_grocery_items_baby_active_idx
  on public.manual_grocery_items (baby_id, store_section, name)
  where not is_deleted;

create table public.derived_work_events (
  id uuid primary key default gen_random_uuid(),
  baby_id uuid not null references public.babies (id) on delete cascade,
  operation text not null check (
    operation in (
      'dismiss_preparation_task',
      'set_derived_grocery_state',
      'add_manual_grocery_item',
      'edit_manual_grocery_item',
      'check_manual_grocery_item',
      'delete_manual_grocery_item'
    )
  ),
  payload jsonb not null,
  result jsonb not null,
  actor_user_id uuid not null,
  idempotency_key uuid not null unique,
  occurred_at timestamptz not null default statement_timestamp()
);

alter table public.preparation_task_dismissals enable row level security;
alter table public.derived_grocery_states enable row level security;
alter table public.manual_grocery_items enable row level security;
alter table public.derived_work_events enable row level security;

create policy "Caregivers can read their preparation task dismissals"
  on public.preparation_task_dismissals
  for select to authenticated
  using (
    exists (
      select 1
      from public.babies
      join public.user_profiles
        on user_profiles.household_id = babies.household_id
      where babies.id = preparation_task_dismissals.baby_id
        and user_profiles.user_id = (select auth.uid())
    )
  );

create policy "Caregivers can read their derived grocery states"
  on public.derived_grocery_states
  for select to authenticated
  using (
    exists (
      select 1
      from public.babies
      join public.user_profiles
        on user_profiles.household_id = babies.household_id
      where babies.id = derived_grocery_states.baby_id
        and user_profiles.user_id = (select auth.uid())
    )
  );

create policy "Caregivers can read their manual grocery items"
  on public.manual_grocery_items
  for select to authenticated
  using (
    exists (
      select 1
      from public.babies
      join public.user_profiles
        on user_profiles.household_id = babies.household_id
      where babies.id = manual_grocery_items.baby_id
        and user_profiles.user_id = (select auth.uid())
    )
  );

create policy "Caregivers can read their derived work history"
  on public.derived_work_events
  for select to authenticated
  using (
    exists (
      select 1
      from public.babies
      join public.user_profiles
        on user_profiles.household_id = babies.household_id
      where babies.id = derived_work_events.baby_id
        and user_profiles.user_id = (select auth.uid())
    )
  );

revoke all on table public.preparation_task_dismissals
  from public, anon, authenticated;
revoke all on table public.derived_grocery_states
  from public, anon, authenticated;
revoke all on table public.manual_grocery_items
  from public, anon, authenticated;
revoke all on table public.derived_work_events
  from public, anon, authenticated;

grant select on table public.preparation_task_dismissals to authenticated;
grant select on table public.derived_grocery_states to authenticated;
grant select on table public.manual_grocery_items to authenticated;
grant select on table public.derived_work_events to authenticated;
grant select, insert, update, delete
  on table public.preparation_task_dismissals to service_role;
grant select, insert, update, delete
  on table public.derived_grocery_states to service_role;
grant select, insert, update, delete
  on table public.manual_grocery_items to service_role;
grant select, insert
  on table public.derived_work_events to service_role;

create or replace function public.prevent_derived_work_event_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Derived work history is append-only'
    using errcode = '55000';
end;
$$;

create trigger derived_work_events_append_only
before update or delete on public.derived_work_events
for each row execute function public.prevent_derived_work_event_changes();

create or replace function public.get_derived_work_and_groceries()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  active_baby record;
  active_plan public.meal_plans%rowtype;
  reference_at timestamptz := statement_timestamp();
  local_today date;
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
      'preparation_tasks', '[]'::jsonb,
      'derived_grocery_items', '[]'::jsonb,
      'manual_grocery_items', '[]'::jsonb
    );
  end if;

  select meal_plans.*
    into active_plan
  from public.meal_plans
  where meal_plans.baby_id = active_baby.id;

  local_today := (reference_at at time zone active_baby.time_zone)::date;

  return (
    with recursive inventory as (
      select
        batches.id as batch_id,
        batches.preparation_id,
        batches.content_revision_id,
        (effective.value->>'deadline_at')::timestamptz as valid_until,
        greatest(0, sum(batch_events.portion_delta))::integer as portions
      from public.batches
      join public.batch_events
        on batch_events.batch_id = batches.id
      cross join lateral (
        select public.current_batch_deadline(batches.id) as value
      ) as effective
      where batches.baby_id = active_baby.id
        and batches.lifecycle_state not in ('finished', 'discarded')
        and (effective.value->>'deadline_at')::timestamptz > reference_at
        and (
          batches.lifecycle_state <> 'frozen'
          or exists (
            select 1
            from public.batch_events as frozen_event
            join public.storage_transition_rules as frozen_rule
              on frozen_rule.id = frozen_event.transition_rule_id
            where frozen_event.batch_id = batches.id
              and frozen_event.event_type = 'frozen'
              and frozen_rule.content_revision_id =
                batches.content_revision_id
              and frozen_rule.transition_kind = 'freeze'
              and frozen_rule.to_state = 'frozen'
          )
        )
      group by
        batches.id,
        batches.preparation_id,
        batches.content_revision_id,
        batches.lifecycle_state,
        effective.value
      having sum(batch_events.portion_delta) > 0
    ),
    inventory_units as (
      select
        inventory.batch_id::text || ':' || unit.number::text as unit_id,
        inventory.preparation_id,
        inventory.content_revision_id,
        inventory.valid_until
      from inventory
      cross join lateral generate_series(1, inventory.portions)
        as unit(number)
    ),
    candidates as (
      select
        meal_components.id as component_id,
        meals.id as meal_id,
        meals.local_date,
        meals.meal_slot,
        meal_components.position,
        meal_components.preparation_id,
        meal_components.revision_id,
        preparations.name as preparation_name,
        foods.id as food_id,
        foods.name as food_name,
        foods.category as store_section,
        row_number() over (
          partition by
            meal_components.preparation_id,
            meal_components.revision_id
          order by
            meals.local_date,
            case meals.meal_slot
              when 'breakfast' then 0
              when 'lunch' then 1
              else 2
            end,
            meal_components.position,
            meal_components.id
        ) as preparation_rank
      from public.meal_components
      join public.meals on meals.id = meal_components.meal_id
      join public.preparations
        on preparations.id = meal_components.preparation_id
      join public.foods on foods.id = preparations.food_id
      where meals.plan_id = active_plan.id
        and meals.status = 'planned'
        and meals.local_date >= local_today
        and meals.local_date < local_today + 7
        and not exists (
          select 1
          from public.batch_events
          where batch_events.meal_component_id = meal_components.id
            and batch_events.event_type = 'served'
        )
        and exists (
          select 1
          from public.current_published_preparations() as published
          where published.preparation_id =
              meal_components.preparation_id
            and published.revision_id = meal_components.revision_id
        )
        and (
          public.get_preparation_eligibility(preparations.slug)->>'status'
        ) = 'eligible'
    ),
    allocation as (
      select
        candidates.*,
        selected.unit_id as allocated_unit_id,
        case
          when selected.unit_id is null then array[]::text[]
          else array[selected.unit_id]
        end as used_unit_ids
      from candidates
      left join lateral (
        select inventory_units.unit_id
        from inventory_units
        where inventory_units.preparation_id =
            candidates.preparation_id
          and inventory_units.content_revision_id =
            candidates.revision_id
          and inventory_units.valid_until >
            ((candidates.local_date + 1)::timestamp
              at time zone active_baby.time_zone)
        order by inventory_units.valid_until, inventory_units.unit_id
        limit 1
      ) as selected on true
      where candidates.preparation_rank = 1

      union all

      select
        candidates.*,
        selected.unit_id as allocated_unit_id,
        allocation.used_unit_ids
          || coalesce(array[selected.unit_id], array[]::text[])
          as used_unit_ids
      from allocation
      join candidates
        on candidates.preparation_id = allocation.preparation_id
        and candidates.revision_id = allocation.revision_id
        and candidates.preparation_rank =
          allocation.preparation_rank + 1
      left join lateral (
        select inventory_units.unit_id
        from inventory_units
        where inventory_units.preparation_id =
            candidates.preparation_id
          and inventory_units.content_revision_id =
            candidates.revision_id
          and inventory_units.valid_until >
            ((candidates.local_date + 1)::timestamp
              at time zone active_baby.time_zone)
          and not (
            inventory_units.unit_id = any(allocation.used_unit_ids)
          )
        order by inventory_units.valid_until, inventory_units.unit_id
        limit 1
      ) as selected on true
    ),
    unmet as (
      select allocation.*
      from allocation
      where allocation.allocated_unit_id is null
    ),
    raw_tasks as (
      select
        unmet.preparation_id,
        unmet.preparation_name,
        unmet.revision_id,
        unmet.food_id,
        count(*)::integer as needed_portions,
        jsonb_agg(
          jsonb_build_object(
            'component_id', unmet.component_id,
            'meal_id', unmet.meal_id,
            'local_date', unmet.local_date,
            'meal_slot', unmet.meal_slot
          )
          order by
            unmet.local_date,
            case unmet.meal_slot
              when 'breakfast' then 0
              when 'lunch' then 1
              else 2
            end,
            unmet.position,
            unmet.component_id
        ) as supporting_meals,
        (
          array_agg(
            unmet.component_id
            order by
              unmet.local_date,
              case unmet.meal_slot
                when 'breakfast' then 0
                when 'lunch' then 1
                else 2
              end,
              unmet.position,
              unmet.component_id
          )
        )[1] as seed_component_id,
        md5(
          string_agg(
            unmet.component_id::text,
            ',' order by
              unmet.local_date,
              case unmet.meal_slot
                when 'breakfast' then 0
                when 'lunch' then 1
                else 2
              end,
              unmet.position,
              unmet.component_id
          )
          || '|'
          || coalesce(
            (
              select string_agg(
                batch_events.id::text
                  || ':' || batch_events.event_type
                  || ':' || batch_events.portion_delta::text,
                ',' order by batch_events.created_at, batch_events.id
              )
              from public.batches
              join public.batch_events
                on batch_events.batch_id = batches.id
              where batches.baby_id = active_baby.id
                and batches.preparation_id = unmet.preparation_id
                and batches.content_revision_id = unmet.revision_id
            ),
            ''
          )
          || '|'
          || coalesce(
            (
              select versions.semantic_version::text
              from public.food_restriction_versions as versions
              where versions.baby_id = active_baby.id
                and versions.food_id = unmet.food_id
            ),
            '0'
          )
        ) as task_fingerprint
      from unmet
      group by
        unmet.preparation_id,
        unmet.preparation_name,
        unmet.revision_id,
        unmet.food_id
    ),
    tasks as (
      select raw_tasks.*
      from raw_tasks
      where not exists (
        select 1
        from public.preparation_task_dismissals
        where preparation_task_dismissals.baby_id = active_baby.id
          and preparation_task_dismissals.plan_version =
            coalesce(active_plan.version, 0)
          and preparation_task_dismissals.preparation_id =
            raw_tasks.preparation_id
          and preparation_task_dismissals.task_fingerprint =
            raw_tasks.task_fingerprint
      )
    ),
    groceries as (
      select
        unmet.food_id,
        unmet.food_name,
        unmet.store_section,
        count(*)::integer as needed_portions
      from unmet
      group by unmet.food_id, unmet.food_name, unmet.store_section
    )
    select jsonb_build_object(
      'status', 'ready',
      'baby_id', active_baby.id,
      'time_zone', active_baby.time_zone,
      'window_start', local_today,
      'plan_version', coalesce(active_plan.version, 0),
      'preparation_tasks', (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'preparation_id', tasks.preparation_id,
              'preparation_name', tasks.preparation_name,
              'needed_portions', tasks.needed_portions,
              'task_fingerprint', tasks.task_fingerprint,
              'supporting_meals', tasks.supporting_meals,
              'seed_component_id', tasks.seed_component_id
            )
            order by tasks.preparation_name, tasks.preparation_id
          ),
          '[]'::jsonb
        )
        from tasks
      ),
      'derived_grocery_items', (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'food_id', groceries.food_id,
              'food_name', groceries.food_name,
              'store_section', groceries.store_section,
              'needed_portions', groceries.needed_portions,
              'already_have',
                coalesce(derived_grocery_states.already_have, false),
              'is_checked',
                coalesce(derived_grocery_states.is_checked, false)
            )
            order by groceries.store_section, groceries.food_name
          ),
          '[]'::jsonb
        )
        from groceries
        left join public.derived_grocery_states
          on derived_grocery_states.baby_id = active_baby.id
          and derived_grocery_states.food_id = groceries.food_id
      ),
      'manual_grocery_items', (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'id', manual_grocery_items.id,
              'name', manual_grocery_items.name,
              'store_section', manual_grocery_items.store_section,
              'quantity', manual_grocery_items.quantity,
              'is_checked', manual_grocery_items.is_checked
            )
            order by
              manual_grocery_items.store_section,
              manual_grocery_items.name,
              manual_grocery_items.id
          ),
          '[]'::jsonb
        )
        from public.manual_grocery_items
        where manual_grocery_items.baby_id = active_baby.id
          and not manual_grocery_items.is_deleted
      )
    )
  );
end;
$$;

revoke all on function public.get_derived_work_and_groceries()
  from public, anon;
grant execute on function public.get_derived_work_and_groceries()
  to authenticated;

create or replace function public.dismiss_preparation_task(
  p_preparation_id text,
  p_plan_version bigint,
  p_task_fingerprint text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  active_baby_id uuid;
  target_plan public.meal_plans%rowtype;
  existing public.derived_work_events%rowtype;
  payload_value jsonb := jsonb_build_object(
    'preparation_id', p_preparation_id,
    'plan_version', p_plan_version,
    'task_fingerprint', p_task_fingerprint
  );
  result_value jsonb;
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
  select * into existing
  from public.derived_work_events
  where idempotency_key = p_idempotency_key;
  if existing.id is not null then
    if existing.actor_user_id = caller_id
      and existing.operation = 'dismiss_preparation_task'
      and existing.payload = payload_value
      and exists (
        select 1
        from public.babies
        join public.user_profiles
          on user_profiles.household_id = babies.household_id
        where babies.id = existing.baby_id
          and user_profiles.user_id = caller_id
      ) then
      return existing.result || jsonb_build_object('idempotent_retry', true);
    end if;
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'idempotency_key_conflict'
    );
  end if;

  select babies.id into active_baby_id
  from public.babies
  join public.user_profiles
    on user_profiles.household_id = babies.household_id
  where babies.is_active
    and user_profiles.user_id = caller_id
  for update of babies;
  select * into target_plan
  from public.meal_plans
  where baby_id = active_baby_id
  for update;

  if target_plan.id is null
    or target_plan.version <> p_plan_version
    or not exists (
      select 1
      from jsonb_array_elements(
        public.get_derived_work_and_groceries()->'preparation_tasks'
      ) as task
      where task->>'preparation_id' = p_preparation_id
        and task->>'task_fingerprint' = p_task_fingerprint
    ) then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'preparation_task_stale'
    );
  end if;

  insert into public.preparation_task_dismissals (
    baby_id,
    plan_version,
    preparation_id,
    task_fingerprint,
    actor_user_id,
    idempotency_key
  ) values (
    active_baby_id,
    p_plan_version,
    p_preparation_id,
    p_task_fingerprint,
    caller_id,
    p_idempotency_key
  )
  on conflict (
    baby_id,
    plan_version,
    preparation_id,
    task_fingerprint
  ) do nothing;

  result_value := jsonb_build_object(
    'status', 'dismissed',
    'preparation_id', p_preparation_id,
    'plan_version', p_plan_version,
    'task_fingerprint', p_task_fingerprint,
    'idempotent_retry', false
  );
  insert into public.derived_work_events (
    baby_id,
    operation,
    payload,
    result,
    actor_user_id,
    idempotency_key
  ) values (
    active_baby_id,
    'dismiss_preparation_task',
    payload_value,
    result_value - 'idempotent_retry',
    caller_id,
    p_idempotency_key
  );
  return result_value;
end;
$$;

revoke all on function public.dismiss_preparation_task(text, bigint, text, uuid)
  from public, anon;
grant execute on function public.dismiss_preparation_task(text, bigint, text, uuid)
  to authenticated;

create or replace function public.set_derived_grocery_state(
  p_food_id text,
  p_operation text,
  p_value boolean,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  active_baby_id uuid;
  existing public.derived_work_events%rowtype;
  payload_value jsonb := jsonb_build_object(
    'food_id', p_food_id,
    'operation', p_operation,
    'value', p_value
  );
  result_value jsonb;
begin
  if caller_id is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;
  if p_idempotency_key is null
    or p_operation not in ('set_already_have', 'set_checked')
    or p_value is null then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'grocery_state_invalid'
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_idempotency_key::text, 0)
  );
  select * into existing
  from public.derived_work_events
  where idempotency_key = p_idempotency_key;
  if existing.id is not null then
    if existing.actor_user_id = caller_id
      and existing.operation = 'set_derived_grocery_state'
      and existing.payload = payload_value
      and exists (
        select 1
        from public.babies
        join public.user_profiles
          on user_profiles.household_id = babies.household_id
        where babies.id = existing.baby_id
          and user_profiles.user_id = caller_id
      ) then
      return existing.result || jsonb_build_object('idempotent_retry', true);
    end if;
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'idempotency_key_conflict'
    );
  end if;

  select babies.id into active_baby_id
  from public.babies
  join public.user_profiles
    on user_profiles.household_id = babies.household_id
  where babies.is_active
    and user_profiles.user_id = caller_id
  for update of babies;
  if active_baby_id is null or not exists (
    select 1 from public.foods where foods.id = p_food_id
  ) then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'grocery_item_unavailable'
    );
  end if;

  insert into public.derived_grocery_states (
    baby_id,
    food_id,
    already_have,
    is_checked,
    actor_user_id
  ) values (
    active_baby_id,
    p_food_id,
    case when p_operation = 'set_already_have' then p_value else false end,
    case when p_operation = 'set_checked' then p_value else false end,
    caller_id
  )
  on conflict (baby_id, food_id) do update set
    already_have = case
      when p_operation = 'set_already_have'
        then p_value
      else derived_grocery_states.already_have
    end,
    is_checked = case
      when p_operation = 'set_checked'
        then p_value
      else derived_grocery_states.is_checked
    end,
    actor_user_id = excluded.actor_user_id,
    updated_at = statement_timestamp();

  result_value := jsonb_build_object(
    'status', 'updated',
    'food_id', p_food_id,
    'operation', p_operation,
    'value', p_value,
    'idempotent_retry', false
  );
  insert into public.derived_work_events (
    baby_id, operation, payload, result, actor_user_id, idempotency_key
  ) values (
    active_baby_id,
    'set_derived_grocery_state',
    payload_value,
    result_value - 'idempotent_retry',
    caller_id,
    p_idempotency_key
  );
  return result_value;
end;
$$;

revoke all on function public.set_derived_grocery_state(
  text, text, boolean, uuid
) from public, anon;
grant execute on function public.set_derived_grocery_state(
  text, text, boolean, uuid
) to authenticated;

create or replace function public.mutate_manual_grocery_item(
  p_operation text,
  p_item_id uuid,
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
  active_baby_id uuid;
  existing public.derived_work_events%rowtype;
  target public.manual_grocery_items%rowtype;
  normalized_name text := nullif(btrim(p_payload->>'name'), '');
  normalized_section text :=
    nullif(btrim(p_payload->>'store_section'), '');
  normalized_quantity integer :=
    public.try_integer(p_payload->>'quantity');
  normalized_checked boolean :=
    case p_payload->>'is_checked'
      when 'true' then true
      when 'false' then false
      else null
    end;
  operation_name text;
  item_id uuid;
  result_value jsonb;
  payload_value jsonb := jsonb_build_object(
    'operation', p_operation,
    'item_id', p_item_id,
    'payload', coalesce(p_payload, '{}'::jsonb)
  );
begin
  if caller_id is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;
  if p_operation not in ('add', 'edit', 'check', 'delete')
    or p_idempotency_key is null
    or p_payload is null
    or jsonb_typeof(p_payload) <> 'object' then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'manual_grocery_operation_invalid'
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_idempotency_key::text, 0)
  );
  select * into existing
  from public.derived_work_events
  where idempotency_key = p_idempotency_key;
  if existing.id is not null then
    if existing.actor_user_id = caller_id
      and existing.payload = payload_value
      and exists (
        select 1
        from public.babies
        join public.user_profiles
          on user_profiles.household_id = babies.household_id
        where babies.id = existing.baby_id
          and user_profiles.user_id = caller_id
      ) then
      return existing.result || jsonb_build_object('idempotent_retry', true);
    end if;
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'idempotency_key_conflict'
    );
  end if;

  select babies.id into active_baby_id
  from public.babies
  join public.user_profiles
    on user_profiles.household_id = babies.household_id
  where babies.is_active
    and user_profiles.user_id = caller_id
  for update of babies;
  if active_baby_id is null then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'profile_unavailable'
    );
  end if;

  if p_operation = 'add' then
    if p_item_id is not null
      or normalized_name is null
      or char_length(normalized_name) > 80
      or normalized_section is null
      or char_length(normalized_section) > 60
      or normalized_quantity not between 1 and 99 then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'manual_grocery_item_invalid'
      );
    end if;
    insert into public.manual_grocery_items (
      baby_id,
      name,
      store_section,
      quantity,
      actor_user_id
    ) values (
      active_baby_id,
      normalized_name,
      normalized_section,
      normalized_quantity,
      caller_id
    )
    returning id into item_id;
    operation_name := 'add_manual_grocery_item';
  else
    select * into target
    from public.manual_grocery_items
    where id = p_item_id
      and baby_id = active_baby_id
      and not is_deleted
    for update;
    if target.id is null then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'manual_grocery_item_unavailable'
      );
    end if;
    item_id := target.id;

    if p_operation = 'edit' then
      if normalized_name is null
        or char_length(normalized_name) > 80
        or normalized_section is null
        or char_length(normalized_section) > 60
        or normalized_quantity not between 1 and 99 then
        return jsonb_build_object(
          'status', 'rejected',
          'reason', 'manual_grocery_item_invalid'
        );
      end if;
      update public.manual_grocery_items set
        name = normalized_name,
        store_section = normalized_section,
        quantity = normalized_quantity,
        actor_user_id = caller_id,
        updated_at = statement_timestamp()
      where id = target.id;
      operation_name := 'edit_manual_grocery_item';
    elsif p_operation = 'check' then
      if normalized_checked is null then
        return jsonb_build_object(
          'status', 'rejected',
          'reason', 'manual_grocery_item_invalid'
        );
      end if;
      update public.manual_grocery_items set
        is_checked = normalized_checked,
        actor_user_id = caller_id,
        updated_at = statement_timestamp()
      where id = target.id;
      operation_name := 'check_manual_grocery_item';
    else
      update public.manual_grocery_items set
        is_deleted = true,
        actor_user_id = caller_id,
        updated_at = statement_timestamp()
      where id = target.id;
      operation_name := 'delete_manual_grocery_item';
    end if;
  end if;

  result_value := jsonb_build_object(
    'status', 'updated',
    'operation', p_operation,
    'item_id', item_id,
    'idempotent_retry', false
  );
  insert into public.derived_work_events (
    baby_id, operation, payload, result, actor_user_id, idempotency_key
  ) values (
    active_baby_id,
    operation_name,
    payload_value,
    result_value - 'idempotent_retry',
    caller_id,
    p_idempotency_key
  );
  return result_value;
end;
$$;

revoke all on function public.mutate_manual_grocery_item(
  text, uuid, jsonb, uuid
) from public, anon;
grant execute on function public.mutate_manual_grocery_item(
  text, uuid, jsonb, uuid
) to authenticated;

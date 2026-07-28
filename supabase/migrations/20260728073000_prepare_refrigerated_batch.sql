alter table public.storage_rules
  add constraint storage_rules_id_revision_id_key
  unique (id, revision_id);

create table public.storage_rule_profiles (
  id text primary key,
  storage_rule_id text not null,
  content_revision_id text not null,
  storage_location text not null
    check (storage_location in ('refrigerator', 'freezer')),
  start_event_kind text not null
    check (start_event_kind = 'prepared_or_opened'),
  precedence integer not null check (precedence >= 0),
  duration_min_hours integer not null check (duration_min_hours > 0),
  duration_max_hours integer not null
    check (duration_max_hours >= duration_min_hours),
  source_id text not null references public.sources (id),
  reviewer_role text not null check (btrim(reviewer_role) <> ''),
  reviewed_at date not null,
  approved_at date not null,
  next_review_at date not null check (next_review_at >= approved_at),
  created_at timestamptz not null default now(),
  foreign key (storage_rule_id, content_revision_id)
    references public.storage_rules (id, revision_id),
  unique (storage_rule_id),
  unique (
    content_revision_id,
    storage_location,
    start_event_kind,
    precedence
  ),
  unique (id, storage_rule_id, content_revision_id)
);

alter table public.storage_rule_profiles enable row level security;

revoke all on table public.storage_rule_profiles
  from public, anon, authenticated;
grant select, insert on table public.storage_rule_profiles to service_role;

create or replace function public.prevent_storage_rule_profile_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Reviewed storage rule profiles are append-only'
    using errcode = '55000';
end;
$$;

create trigger storage_rule_profiles_append_only
before update or delete on public.storage_rule_profiles
for each row execute function public.prevent_storage_rule_profile_changes();

create or replace function public.import_storage_rule_profiles(
  p_profiles jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_value jsonb;
  existing_profile public.storage_rule_profiles%rowtype;
  referenced_rule record;
  imported_count integer := 0;
  profile_id text;
  rule_id text;
  revision_id_value text;
  location_value text;
  start_kind text;
  precedence_value integer;
  minimum_hours integer;
  maximum_hours integer;
  source_value text;
  reviewer_value text;
  reviewed_value date;
  approved_value date;
  next_review_value date;
begin
  if jsonb_typeof(p_profiles) <> 'array'
    or jsonb_array_length(p_profiles) = 0 then
    raise exception 'Storage rule profiles must be a non-empty array'
      using errcode = '22023';
  end if;

  for profile_value in
    select value from jsonb_array_elements(p_profiles)
  loop
    profile_id := nullif(btrim(profile_value->>'id'), '');
    rule_id := nullif(btrim(profile_value->>'storage_rule_id'), '');
    revision_id_value := nullif(
      btrim(profile_value->>'content_revision_id'),
      ''
    );
    location_value := nullif(
      btrim(profile_value->>'storage_location'),
      ''
    );
    start_kind := nullif(btrim(profile_value->>'start_event_kind'), '');
    precedence_value := (profile_value->>'precedence')::integer;
    minimum_hours := (profile_value->>'duration_min_hours')::integer;
    maximum_hours := (profile_value->>'duration_max_hours')::integer;
    source_value := nullif(btrim(profile_value->>'source_id'), '');
    reviewer_value := nullif(btrim(profile_value->>'reviewer_role'), '');
    reviewed_value := (profile_value->>'reviewed_at')::date;
    approved_value := (profile_value->>'approved_at')::date;
    next_review_value := (profile_value->>'next_review_at')::date;

    if profile_id is null
      or rule_id is null
      or revision_id_value is null
      or location_value not in ('refrigerator', 'freezer')
      or start_kind <> 'prepared_or_opened'
      or precedence_value is null
      or precedence_value < 0
      or minimum_hours is null
      or minimum_hours <= 0
      or maximum_hours is null
      or maximum_hours < minimum_hours
      or source_value is null
      or reviewer_value is null
      or reviewed_value is null
      or approved_value is null
      or next_review_value is null
      or next_review_value < approved_value then
      raise exception 'Storage rule profile is incomplete or invalid'
        using errcode = '22023';
    end if;

    select
      storage_rules.id,
      storage_rules.revision_id,
      storage_rules.support_status,
      storage_rules.deadline_kind,
      storage_rules.duration_hours,
      storage_rules.guidance,
      content_revisions.status as revision_status,
      content_revisions.source_id as revision_source_id
      into referenced_rule
    from public.storage_rules
    join public.content_revisions
      on content_revisions.id = storage_rules.revision_id
    where storage_rules.id = rule_id
      and storage_rules.revision_id = revision_id_value;

    if referenced_rule.id is null
      or referenced_rule.revision_status <> 'approved'
      or referenced_rule.support_status <> 'supported'
      or referenced_rule.deadline_kind <> 'discard_after'
      or referenced_rule.duration_hours is null
      or referenced_rule.duration_hours <> minimum_hours
      or referenced_rule.guidance is null
      or referenced_rule.revision_source_id <> source_value
      or not exists (
        select 1 from public.sources where sources.id = source_value
      ) then
      raise exception
        'Storage rule profile must reference a supported approved discard rule'
        using errcode = '22023';
    end if;

    select *
      into existing_profile
    from public.storage_rule_profiles
    where storage_rule_profiles.id = profile_id;

    if existing_profile.id is not null then
      if existing_profile.storage_rule_id is distinct from rule_id
        or existing_profile.content_revision_id
          is distinct from revision_id_value
        or existing_profile.storage_location is distinct from location_value
        or existing_profile.start_event_kind is distinct from start_kind
        or existing_profile.precedence is distinct from precedence_value
        or existing_profile.duration_min_hours is distinct from minimum_hours
        or existing_profile.duration_max_hours is distinct from maximum_hours
        or existing_profile.source_id is distinct from source_value
        or existing_profile.reviewer_role is distinct from reviewer_value
        or existing_profile.reviewed_at is distinct from reviewed_value
        or existing_profile.approved_at is distinct from approved_value
        or existing_profile.next_review_at is distinct from next_review_value
      then
        raise exception
          'Reviewed storage rule profile identifiers are immutable'
          using errcode = '55000';
      end if;
      continue;
    end if;

    insert into public.storage_rule_profiles (
      id,
      storage_rule_id,
      content_revision_id,
      storage_location,
      start_event_kind,
      precedence,
      duration_min_hours,
      duration_max_hours,
      source_id,
      reviewer_role,
      reviewed_at,
      approved_at,
      next_review_at
    ) values (
      profile_id,
      rule_id,
      revision_id_value,
      location_value,
      start_kind,
      precedence_value,
      minimum_hours,
      maximum_hours,
      source_value,
      reviewer_value,
      reviewed_value,
      approved_value,
      next_review_value
    );

    imported_count := imported_count + 1;
  end loop;

  return imported_count;
end;
$$;

revoke all on function public.import_storage_rule_profiles(jsonb)
  from public, anon, authenticated;
grant execute on function public.import_storage_rule_profiles(jsonb)
  to service_role;

create table public.batches (
  id uuid primary key default gen_random_uuid(),
  baby_id uuid not null references public.babies (id) on delete cascade,
  preparation_id text not null references public.preparations (id),
  content_revision_id text not null,
  storage_location text not null check (storage_location = 'refrigerator'),
  prepared_or_opened_at timestamptz not null,
  initial_portions integer not null check (initial_portions between 1 and 99),
  remaining_portions integer not null
    check (remaining_portions between 0 and 99),
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  foreign key (content_revision_id, preparation_id)
    references public.content_revisions (id, preparation_id),
  unique (baby_id, idempotency_key),
  unique (id, content_revision_id)
);

create table public.batch_events (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.batches (id) on delete cascade,
  event_type text not null check (event_type = 'prepared_or_opened'),
  occurred_at timestamptz not null,
  actor_user_id uuid not null,
  portion_delta integer not null check (portion_delta between 1 and 99),
  created_at timestamptz not null default now(),
  unique (id, batch_id)
);

create table public.batch_deadlines (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null unique,
  start_event_id uuid not null unique,
  rule_profile_id text not null,
  storage_rule_id text not null,
  content_revision_id text not null,
  deadline_kind text not null check (deadline_kind = 'discard_after'),
  applied_duration_hours integer not null
    check (applied_duration_hours > 0),
  reviewed_duration_min_hours integer not null
    check (reviewed_duration_min_hours > 0),
  reviewed_duration_max_hours integer not null
    check (
      reviewed_duration_max_hours >= reviewed_duration_min_hours
    ),
  deadline_at timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key (batch_id, content_revision_id)
    references public.batches (id, content_revision_id) on delete cascade,
  foreign key (start_event_id, batch_id)
    references public.batch_events (id, batch_id),
  foreign key (rule_profile_id, storage_rule_id, content_revision_id)
    references public.storage_rule_profiles (
      id,
      storage_rule_id,
      content_revision_id
    ),
  foreign key (storage_rule_id, content_revision_id)
    references public.storage_rules (id, revision_id)
);

create index batches_baby_deadline_lookup_idx
  on public.batches (baby_id, storage_location);
create index batch_events_batch_id_idx on public.batch_events (batch_id);
create index batch_deadlines_deadline_at_idx
  on public.batch_deadlines (deadline_at);

alter table public.batches enable row level security;
alter table public.batch_events enable row level security;
alter table public.batch_deadlines enable row level security;

create policy "Caregivers can read their baby's batches"
  on public.batches
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.babies
      join public.user_profiles
        on user_profiles.household_id = babies.household_id
      where babies.id = batches.baby_id
        and user_profiles.user_id = (select auth.uid())
    )
  );

create policy "Caregivers can read their baby's batch events"
  on public.batch_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.batches
      join public.babies on babies.id = batches.baby_id
      join public.user_profiles
        on user_profiles.household_id = babies.household_id
      where batches.id = batch_events.batch_id
        and user_profiles.user_id = (select auth.uid())
    )
  );

create policy "Caregivers can read their baby's batch deadlines"
  on public.batch_deadlines
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.batches
      join public.babies on babies.id = batches.baby_id
      join public.user_profiles
        on user_profiles.household_id = babies.household_id
      where batches.id = batch_deadlines.batch_id
        and user_profiles.user_id = (select auth.uid())
    )
  );

revoke all on table public.batches from public, anon, authenticated;
revoke all on table public.batch_events from public, anon, authenticated;
revoke all on table public.batch_deadlines from public, anon, authenticated;

grant select on table public.batches to authenticated;
grant select on table public.batch_events to authenticated;
grant select on table public.batch_deadlines to authenticated;

grant select, insert, update, delete on table public.batches to service_role;
grant select, insert, update, delete on table public.batch_events
  to service_role;
grant select, insert, update, delete on table public.batch_deadlines
  to service_role;

create or replace function public.prevent_batch_history_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Batch events and deadlines are append-only'
    using errcode = '55000';
end;
$$;

create trigger batch_events_append_only
before update or delete on public.batch_events
for each row execute function public.prevent_batch_history_changes();

create trigger batch_deadlines_append_only
before update or delete on public.batch_deadlines
for each row execute function public.prevent_batch_history_changes();

create or replace function public.reconciled_batch_portions(
  p_batch_id uuid
)
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(batch_events.portion_delta), 0)::integer
  from public.batch_events
  where batch_events.batch_id = p_batch_id;
$$;

create or replace function public.preview_refrigerated_batch(
  p_meal_component_id uuid,
  p_prepared_or_opened_at timestamptz default statement_timestamp(),
  p_storage_location text default 'refrigerator',
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
  component record;
  eligibility jsonb;
  selected_precedence integer;
  selected_count integer;
  selected_profile_id text;
  selected_profile record;
  calculated_deadline timestamptz;
begin
  if caller_id is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  if p_prepared_or_opened_at is null
    or p_reference_at is null
    or p_prepared_or_opened_at > p_reference_at then
    return jsonb_build_object(
      'status', 'unsupported',
      'reason', 'invalid_prepared_time'
    );
  end if;

  if p_storage_location <> 'refrigerator' then
    return jsonb_build_object(
      'status', 'unsupported',
      'reason', 'storage_location_unsupported'
    );
  end if;

  select
    meal_components.id,
    meal_components.preparation_id,
    meal_components.revision_id,
    preparations.slug as preparation_slug,
    preparations.name as preparation_name,
    meal_plans.baby_id
    into component
  from public.meal_components
  join public.meals on meals.id = meal_components.meal_id
  join public.meal_plans on meal_plans.id = meals.plan_id
  join public.babies on babies.id = meal_plans.baby_id
  join public.user_profiles
    on user_profiles.household_id = babies.household_id
  join public.preparations
    on preparations.id = meal_components.preparation_id
  where meal_components.id = p_meal_component_id
    and babies.is_active
    and user_profiles.user_id = caller_id;

  if component.id is null then
    return jsonb_build_object(
      'status', 'unsupported',
      'reason', 'planned_component_unavailable'
    );
  end if;

  eligibility := public.get_preparation_eligibility(
    component.preparation_slug
  );
  if eligibility->>'status' <> 'eligible' then
    return jsonb_build_object(
      'status', 'unsupported',
      'reason', coalesce(
        eligibility->>'reason',
        'eligibility_unavailable'
      )
    );
  end if;

  if not exists (
    select 1
    from public.current_published_preparations() as published
    where published.preparation_id = component.preparation_id
      and published.revision_id = component.revision_id
  ) then
    return jsonb_build_object(
      'status', 'unsupported',
      'reason', 'preparation_not_approved'
    );
  end if;

  select max(storage_rule_profiles.precedence)
    into selected_precedence
  from public.storage_rule_profiles
  join public.storage_rules
    on storage_rules.id = storage_rule_profiles.storage_rule_id
    and storage_rules.revision_id =
      storage_rule_profiles.content_revision_id
  where storage_rule_profiles.content_revision_id = component.revision_id
    and storage_rule_profiles.storage_location = p_storage_location
    and storage_rule_profiles.start_event_kind = 'prepared_or_opened'
    and storage_rules.support_status = 'supported'
    and storage_rules.deadline_kind = 'discard_after'
    and storage_rules.duration_hours =
      storage_rule_profiles.duration_min_hours;

  if selected_precedence is null then
    return jsonb_build_object(
      'status', 'unsupported',
      'reason', 'storage_rule_unavailable'
    );
  end if;

  select count(*), min(storage_rule_profiles.id)
    into selected_count, selected_profile_id
  from public.storage_rule_profiles
  join public.storage_rules
    on storage_rules.id = storage_rule_profiles.storage_rule_id
    and storage_rules.revision_id =
      storage_rule_profiles.content_revision_id
  where storage_rule_profiles.content_revision_id = component.revision_id
    and storage_rule_profiles.storage_location = p_storage_location
    and storage_rule_profiles.start_event_kind = 'prepared_or_opened'
    and storage_rule_profiles.precedence = selected_precedence
    and storage_rules.support_status = 'supported'
    and storage_rules.deadline_kind = 'discard_after'
    and storage_rules.duration_hours =
      storage_rule_profiles.duration_min_hours;

  if selected_count <> 1 then
    return jsonb_build_object(
      'status', 'unsupported',
      'reason', 'storage_rule_ambiguous'
    );
  end if;

  select
    storage_rule_profiles.id,
    storage_rule_profiles.storage_rule_id,
    storage_rule_profiles.content_revision_id,
    storage_rule_profiles.duration_min_hours,
    storage_rule_profiles.duration_max_hours,
    storage_rule_profiles.reviewed_at,
    storage_rules.duration_hours,
    storage_rules.guidance,
    sources.title as source_title,
    sources.url as source_url
    into selected_profile
  from public.storage_rule_profiles
  join public.storage_rules
    on storage_rules.id = storage_rule_profiles.storage_rule_id
    and storage_rules.revision_id =
      storage_rule_profiles.content_revision_id
  join public.sources on sources.id = storage_rule_profiles.source_id
  where storage_rule_profiles.id = selected_profile_id;

  calculated_deadline := p_prepared_or_opened_at
    + pg_catalog.make_interval(hours => selected_profile.duration_hours);

  return jsonb_build_object(
    'status', 'ready',
    'preparation_name', component.preparation_name,
    'storage_location', p_storage_location,
    'rule_profile_id', selected_profile.id,
    'storage_rule_id', selected_profile.storage_rule_id,
    'content_revision_id', selected_profile.content_revision_id,
    'reviewed_duration_range_hours', jsonb_build_object(
      'minimum', selected_profile.duration_min_hours,
      'maximum', selected_profile.duration_max_hours
    ),
    'applied_duration_hours', selected_profile.duration_hours,
    'guidance', selected_profile.guidance,
    'reviewed_at', selected_profile.reviewed_at,
    'source_title', selected_profile.source_title,
    'source_url', selected_profile.source_url,
    'prepared_or_opened_at', p_prepared_or_opened_at,
    'deadline_at', calculated_deadline
  );
end;
$$;

create or replace function public.create_refrigerated_batch(
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
declare
  caller_id uuid := (select auth.uid());
  component record;
  preview jsonb;
  existing_batch record;
  inserted_batch_id uuid;
  inserted_event_id uuid;
  trusted_now timestamptz := statement_timestamp();
begin
  if caller_id is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  if p_portion_count is null or p_portion_count not between 1 and 99 then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'invalid_portion_count'
    );
  end if;

  if p_idempotency_key is null then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'idempotency_key_required'
    );
  end if;

  if p_prepared_or_opened_at is null
    or p_prepared_or_opened_at > trusted_now then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'invalid_prepared_time'
    );
  end if;

  select
    meal_components.preparation_id,
    meal_components.revision_id,
    meal_plans.baby_id
    into component
  from public.meal_components
  join public.meals on meals.id = meal_components.meal_id
  join public.meal_plans on meal_plans.id = meals.plan_id
  join public.babies on babies.id = meal_plans.baby_id
  join public.user_profiles
    on user_profiles.household_id = babies.household_id
  where meal_components.id = p_meal_component_id
    and babies.is_active
    and user_profiles.user_id = caller_id
  for update of babies;

  if component.baby_id is null then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'planned_component_unavailable'
    );
  end if;

  select
    batches.id,
    batch_deadlines.deadline_at
    into existing_batch
  from public.batches
  join public.batch_deadlines
    on batch_deadlines.batch_id = batches.id
  where batches.baby_id = component.baby_id
    and batches.idempotency_key = p_idempotency_key;

  if existing_batch.id is not null then
    return jsonb_build_object(
      'status', 'created',
      'batch_id', existing_batch.id,
      'remaining_portions', (
        select remaining_portions
        from public.batches
        where batches.id = existing_batch.id
      ),
      'deadline_at', existing_batch.deadline_at,
      'idempotent_retry', true
    );
  end if;

  perform 1
  from public.content_revisions
  where content_revisions.id = component.revision_id
  for update;

  preview := public.preview_refrigerated_batch(
    p_meal_component_id,
    p_prepared_or_opened_at,
    p_storage_location,
    trusted_now
  );

  if preview->>'status' <> 'ready' then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', coalesce(preview->>'reason', 'storage_rule_unavailable')
    );
  end if;

  insert into public.batches (
    baby_id,
    preparation_id,
    content_revision_id,
    storage_location,
    prepared_or_opened_at,
    initial_portions,
    remaining_portions,
    idempotency_key
  ) values (
    component.baby_id,
    component.preparation_id,
    component.revision_id,
    p_storage_location,
    p_prepared_or_opened_at,
    p_portion_count,
    p_portion_count,
    p_idempotency_key
  )
  returning batches.id into inserted_batch_id;

  insert into public.batch_events (
    batch_id,
    event_type,
    occurred_at,
    actor_user_id,
    portion_delta
  ) values (
    inserted_batch_id,
    'prepared_or_opened',
    p_prepared_or_opened_at,
    caller_id,
    p_portion_count
  )
  returning batch_events.id into inserted_event_id;

  insert into public.batch_deadlines (
    batch_id,
    start_event_id,
    rule_profile_id,
    storage_rule_id,
    content_revision_id,
    deadline_kind,
    applied_duration_hours,
    reviewed_duration_min_hours,
    reviewed_duration_max_hours,
    deadline_at
  ) values (
    inserted_batch_id,
    inserted_event_id,
    preview->>'rule_profile_id',
    preview->>'storage_rule_id',
    preview->>'content_revision_id',
    'discard_after',
    (preview->>'applied_duration_hours')::integer,
    (preview->'reviewed_duration_range_hours'->>'minimum')::integer,
    (preview->'reviewed_duration_range_hours'->>'maximum')::integer,
    (preview->>'deadline_at')::timestamptz
  );

  return jsonb_build_object(
    'status', 'created',
    'batch_id', inserted_batch_id,
    'remaining_portions', p_portion_count,
    'deadline_at', (preview->>'deadline_at')::timestamptz,
    'idempotent_retry', false
  );
end;
$$;

create or replace function public.reconcile_batch_projection(
  p_batch_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  owned_batch record;
  ledger_portions integer;
begin
  if caller_id is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  select batches.id
    into owned_batch
  from public.batches
  join public.babies on babies.id = batches.baby_id
  join public.user_profiles
    on user_profiles.household_id = babies.household_id
  where batches.id = p_batch_id
    and user_profiles.user_id = caller_id
  for update of batches;

  if owned_batch.id is null then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'batch_not_accessible'
    );
  end if;

  ledger_portions := public.reconciled_batch_portions(p_batch_id);

  update public.batches
  set remaining_portions = ledger_portions
  where batches.id = p_batch_id;

  return jsonb_build_object(
    'status', 'reconciled',
    'batch_id', p_batch_id,
    'remaining_portions', ledger_portions
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

revoke all on function public.reconciled_batch_portions(uuid)
  from public, anon, authenticated;
revoke all on function public.preview_refrigerated_batch(
  uuid,
  timestamptz,
  text,
  timestamptz
) from public, anon;
revoke all on function public.create_refrigerated_batch(
  uuid,
  timestamptz,
  integer,
  uuid,
  text
) from public, anon;
revoke all on function public.reconcile_batch_projection(uuid)
  from public, anon;
revoke all on function public.get_kitchen_inventory(timestamptz)
  from public, anon;

grant execute on function public.preview_refrigerated_batch(
  uuid,
  timestamptz,
  text,
  timestamptz
) to authenticated;
grant execute on function public.create_refrigerated_batch(
  uuid,
  timestamptz,
  integer,
  uuid,
  text
) to authenticated;
grant execute on function public.reconcile_batch_projection(uuid)
  to authenticated;
grant execute on function public.get_kitchen_inventory(timestamptz)
  to authenticated;

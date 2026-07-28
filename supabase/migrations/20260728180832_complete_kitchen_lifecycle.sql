create or replace function public.try_integer(p_value text)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_value::integer;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    return null;
end;
$$;

create table public.storage_transition_rules (
  id text primary key,
  content_revision_id text not null
    references public.content_revisions (id),
  transition_kind text not null
    check (
      transition_kind in (
        'freeze',
        'begin_thaw',
        'return_untouched'
      )
    ),
  from_state text not null,
  to_state text not null,
  deadline_kind text
    check (
      deadline_kind is null
      or deadline_kind in (
        'discard_after',
        'quality_by',
        'informational'
      )
    ),
  duration_min_hours integer
    check (duration_min_hours is null or duration_min_hours > 0),
  duration_max_hours integer
    check (
      duration_max_hours is null
      or duration_max_hours >= duration_min_hours
    ),
  clock_start_event text
    check (
      clock_start_event is null
      or clock_start_event in ('thaw_started', 'thawed')
    ),
  resets_prior_clock boolean not null,
  method text,
  refreezing_policy text
    check (
      refreezing_policy is null
      or refreezing_policy in (
        'prohibited',
        'requires_separate_reviewed_rule'
      )
    ),
  return_policy text
    check (
      return_policy is null
      or return_policy = 'untouched_separately_stored_only'
    ),
  guidance text not null check (btrim(guidance) <> ''),
  source_id text not null references public.sources (id),
  reviewer_role text not null check (btrim(reviewer_role) <> ''),
  reviewed_at date not null,
  approved_at date not null,
  next_review_at date not null check (next_review_at >= approved_at),
  created_at timestamptz not null default now(),
  unique (content_revision_id, transition_kind, from_state),
  check (
    (
      transition_kind = 'freeze'
      and from_state = 'refrigerated'
      and to_state = 'frozen'
      and deadline_kind is not null
      and (
        (
          deadline_kind = 'informational'
          and duration_min_hours is null
          and duration_max_hours is null
        )
        or (
          deadline_kind <> 'informational'
          and duration_min_hours is not null
          and duration_max_hours is not null
        )
      )
      and clock_start_event is null
      and not resets_prior_clock
      and method is null
      and refreezing_policy is null
      and return_policy is null
    )
    or
    (
      transition_kind = 'begin_thaw'
      and from_state = 'frozen'
      and to_state = 'thawing'
      and deadline_kind = 'discard_after'
      and duration_min_hours is not null
      and duration_max_hours is not null
      and clock_start_event is not null
      and not resets_prior_clock
      and method is not null
      and btrim(method) <> ''
      and refreezing_policy is not null
      and return_policy is null
    )
    or
    (
      transition_kind = 'return_untouched'
      and from_state in ('refrigerated', 'thawed')
      and to_state = from_state
      and deadline_kind is null
      and duration_min_hours is null
      and duration_max_hours is null
      and clock_start_event is null
      and not resets_prior_clock
      and method is null
      and refreezing_policy is null
      and return_policy = 'untouched_separately_stored_only'
    )
  )
);

alter table public.storage_transition_rules enable row level security;
revoke all on table public.storage_transition_rules
  from public, anon, authenticated;
grant select, insert on table public.storage_transition_rules to service_role;

create or replace function public.prevent_storage_transition_rule_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Reviewed storage transition rules are append-only'
    using errcode = '55000';
end;
$$;

create trigger storage_transition_rules_append_only
before update or delete on public.storage_transition_rules
for each row
execute function public.prevent_storage_transition_rule_changes();

create or replace function public.import_storage_transition_rules(
  p_rules jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  rule_value jsonb;
  existing_rule public.storage_transition_rules%rowtype;
  imported_count integer := 0;
  candidate public.storage_transition_rules%rowtype;
begin
  if jsonb_typeof(p_rules) <> 'array'
    or jsonb_array_length(p_rules) = 0 then
    raise exception 'Storage transition rules must be a non-empty array'
      using errcode = '22023';
  end if;

  for rule_value in
    select value from jsonb_array_elements(p_rules)
  loop
    if jsonb_typeof(rule_value->'resets_prior_clock')
      is distinct from 'boolean' then
      raise exception 'Storage transition rule is incomplete or invalid'
        using errcode = '22023';
    end if;

    candidate.id := nullif(btrim(rule_value->>'id'), '');
    candidate.content_revision_id :=
      nullif(btrim(rule_value->>'content_revision_id'), '');
    candidate.transition_kind :=
      nullif(btrim(rule_value->>'transition_kind'), '');
    candidate.from_state :=
      nullif(btrim(rule_value->>'from_state'), '');
    candidate.to_state := nullif(btrim(rule_value->>'to_state'), '');
    candidate.deadline_kind :=
      nullif(btrim(rule_value->>'deadline_kind'), '');
    candidate.duration_min_hours :=
      public.try_integer(rule_value->>'duration_min_hours');
    candidate.duration_max_hours :=
      public.try_integer(rule_value->>'duration_max_hours');
    candidate.clock_start_event :=
      nullif(btrim(rule_value->>'clock_start_event'), '');
    candidate.resets_prior_clock :=
      (rule_value->>'resets_prior_clock')::boolean;
    candidate.method := nullif(btrim(rule_value->>'method'), '');
    candidate.refreezing_policy :=
      nullif(btrim(rule_value->>'refreezing_policy'), '');
    candidate.return_policy :=
      nullif(btrim(rule_value->>'return_policy'), '');
    candidate.guidance := nullif(btrim(rule_value->>'guidance'), '');
    candidate.source_id := nullif(btrim(rule_value->>'source_id'), '');
    candidate.reviewer_role :=
      nullif(btrim(rule_value->>'reviewer_role'), '');
    candidate.reviewed_at := public.try_date(rule_value->>'reviewed_at');
    candidate.approved_at := public.try_date(rule_value->>'approved_at');
    candidate.next_review_at :=
      public.try_date(rule_value->>'next_review_at');

    if candidate.id is null
      or candidate.content_revision_id is null
      or candidate.transition_kind not in (
        'freeze',
        'begin_thaw',
        'return_untouched'
      )
      or candidate.from_state is null
      or candidate.to_state is null
      or candidate.guidance is null
      or candidate.source_id is null
      or candidate.reviewer_role is null
      or candidate.reviewed_at is null
      or candidate.approved_at is null
      or candidate.next_review_at is null
      or candidate.next_review_at < candidate.approved_at
      or not exists (
        select 1
        from public.content_revisions
        where content_revisions.id =
          candidate.content_revision_id
          and content_revisions.status = 'approved'
          and content_revisions.source_id = candidate.source_id
      )
      or not exists (
        select 1
        from public.sources
        where sources.id = candidate.source_id
      ) then
      raise exception 'Storage transition rule is incomplete or invalid'
        using errcode = '22023';
    end if;

    select *
      into existing_rule
    from public.storage_transition_rules
    where storage_transition_rules.id = candidate.id;

    if existing_rule.id is not null then
      if to_jsonb(existing_rule)
        - 'created_at'
        is distinct from
        to_jsonb(candidate)
        - 'created_at'
      then
        raise exception
          'Reviewed storage transition rule identifiers are immutable'
          using errcode = '55000';
      end if;
      continue;
    end if;

    insert into public.storage_transition_rules (
      id,
      content_revision_id,
      transition_kind,
      from_state,
      to_state,
      deadline_kind,
      duration_min_hours,
      duration_max_hours,
      clock_start_event,
      resets_prior_clock,
      method,
      refreezing_policy,
      return_policy,
      guidance,
      source_id,
      reviewer_role,
      reviewed_at,
      approved_at,
      next_review_at
    ) values (
      candidate.id,
      candidate.content_revision_id,
      candidate.transition_kind,
      candidate.from_state,
      candidate.to_state,
      candidate.deadline_kind,
      candidate.duration_min_hours,
      candidate.duration_max_hours,
      candidate.clock_start_event,
      candidate.resets_prior_clock,
      candidate.method,
      candidate.refreezing_policy,
      candidate.return_policy,
      candidate.guidance,
      candidate.source_id,
      candidate.reviewer_role,
      candidate.reviewed_at,
      candidate.approved_at,
      candidate.next_review_at
    );
    imported_count := imported_count + 1;
  end loop;

  return imported_count;
end;
$$;

revoke all on function public.import_storage_transition_rules(jsonb)
  from public, anon, authenticated;
grant execute on function public.import_storage_transition_rules(jsonb)
  to service_role;

alter table public.batches
  drop constraint batches_storage_location_check,
  add constraint batches_storage_location_check
    check (storage_location in ('refrigerator', 'freezer')),
  add column lifecycle_state text not null default 'refrigerated'
    check (
      lifecycle_state in (
        'refrigerated',
        'frozen',
        'thawing',
        'thawed',
        'finished',
        'discarded'
      )
    );

alter table public.batch_events
  add column transition_rule_id text
    references public.storage_transition_rules (id),
  add column compensates_event_id uuid
    references public.batch_events (id),
  add column metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object');

alter table public.batch_events
  drop constraint batch_events_supported_transition_check,
  add constraint batch_events_supported_transition_check
    check (
      (
        event_type = 'prepared_or_opened'
        and portion_delta between 1 and 99
        and meal_component_id is null
        and idempotency_key is null
        and resulting_portions is null
        and transition_rule_id is null
        and compensates_event_id is null
      )
      or
      (
        event_type = 'served'
        and portion_delta = -1
        and meal_component_id is not null
        and idempotency_key is not null
        and resulting_portions is not null
        and transition_rule_id is null
        and compensates_event_id is null
      )
      or
      (
        event_type in ('discarded', 'finished')
        and portion_delta between -99 and -1
        and meal_component_id is null
        and idempotency_key is not null
        and resulting_portions = 0
        and transition_rule_id is null
        and compensates_event_id is null
      )
      or
      (
        event_type in ('frozen', 'thaw_started', 'thawed')
        and portion_delta = 0
        and meal_component_id is null
        and idempotency_key is not null
        and resulting_portions is not null
        and transition_rule_id is not null
        and compensates_event_id is null
      )
      or
      (
        event_type = 'returned_untouched'
        and portion_delta = 1
        and meal_component_id is null
        and idempotency_key is not null
        and resulting_portions is not null
        and transition_rule_id is not null
        and compensates_event_id is not null
      )
      or
      (
        event_type = 'corrected'
        and portion_delta between -99 and -1
        and meal_component_id is null
        and idempotency_key is not null
        and resulting_portions is not null
        and transition_rule_id is null
        and compensates_event_id is not null
      )
    );

create unique index batch_events_returned_served_event_idx
  on public.batch_events (compensates_event_id)
  where event_type = 'returned_untouched';

create table public.batch_lifecycle_deadlines (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.batches (id) on delete cascade,
  start_event_id uuid not null unique,
  transition_rule_id text not null,
  deadline_kind text not null
    check (
      deadline_kind in (
        'discard_after',
        'quality_by',
        'informational'
      )
    ),
  applied_duration_hours integer
    check (applied_duration_hours is null or applied_duration_hours > 0),
  reviewed_duration_min_hours integer
    check (
      reviewed_duration_min_hours is null
      or reviewed_duration_min_hours > 0
    ),
  reviewed_duration_max_hours integer
    check (
      reviewed_duration_max_hours is null
      or reviewed_duration_max_hours >= reviewed_duration_min_hours
    ),
  deadline_at timestamptz,
  resets_prior_clock boolean not null,
  created_at timestamptz not null default now(),
  foreign key (start_event_id, batch_id)
    references public.batch_events (id, batch_id),
  foreign key (transition_rule_id)
    references public.storage_transition_rules (id),
  check (
    (
      deadline_kind = 'informational'
      and applied_duration_hours is null
      and reviewed_duration_min_hours is null
      and reviewed_duration_max_hours is null
      and deadline_at is null
    )
    or (
      deadline_kind <> 'informational'
      and applied_duration_hours is not null
      and reviewed_duration_min_hours is not null
      and reviewed_duration_max_hours is not null
      and deadline_at is not null
    )
  )
);

create index batch_lifecycle_deadlines_batch_idx
  on public.batch_lifecycle_deadlines (batch_id, created_at desc);

alter table public.batch_lifecycle_deadlines enable row level security;
create policy "Caregivers can read their baby's lifecycle deadlines"
  on public.batch_lifecycle_deadlines
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.batches
      join public.babies on babies.id = batches.baby_id
      join public.user_profiles
        on user_profiles.household_id = babies.household_id
      where batches.id = batch_lifecycle_deadlines.batch_id
        and user_profiles.user_id = (select auth.uid())
    )
  );
revoke all on table public.batch_lifecycle_deadlines
  from public, anon, authenticated;
grant select on table public.batch_lifecycle_deadlines to authenticated;
grant select, insert, update, delete
  on table public.batch_lifecycle_deadlines to service_role;

create trigger batch_lifecycle_deadlines_append_only
before update or delete on public.batch_lifecycle_deadlines
for each row execute function public.prevent_batch_history_changes();

create or replace function public.resolve_storage_transition_rule(
  p_revision_id text,
  p_transition_kind text,
  p_from_state text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  matched_rules integer;
  target_rule public.storage_transition_rules%rowtype;
begin
  if not exists (
    select 1
    from public.current_published_preparations() as published
    where published.revision_id = p_revision_id
  ) then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'preparation_not_approved'
    );
  end if;

  select count(*), min(storage_transition_rules.id)
    into matched_rules, target_rule.id
  from public.storage_transition_rules
  where storage_transition_rules.content_revision_id = p_revision_id
    and storage_transition_rules.transition_kind = p_transition_kind
    and storage_transition_rules.from_state = p_from_state;

  if matched_rules <> 1 then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'transition_rule_unavailable'
    );
  end if;

  select *
    into target_rule
  from public.storage_transition_rules
  where storage_transition_rules.id = target_rule.id;

  return jsonb_build_object(
    'status', 'ready',
    'id', target_rule.id,
    'transition_kind', target_rule.transition_kind,
    'from_state', target_rule.from_state,
    'to_state', target_rule.to_state,
    'deadline_kind', target_rule.deadline_kind,
    'duration_min_hours', target_rule.duration_min_hours,
    'duration_max_hours', target_rule.duration_max_hours,
    'clock_start_event', target_rule.clock_start_event,
    'resets_prior_clock', target_rule.resets_prior_clock,
    'method', target_rule.method,
    'refreezing_policy', target_rule.refreezing_policy,
    'return_policy', target_rule.return_policy,
    'guidance', target_rule.guidance,
    'source_id', target_rule.source_id,
    'reviewed_at', target_rule.reviewed_at
  );
end;
$$;

create or replace function public.current_batch_deadline(
  p_batch_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with target as (
    select batches.lifecycle_state
    from public.batches
    where batches.id = p_batch_id
  ),
  original as (
    select
      batch_deadlines.deadline_kind,
      batch_deadlines.deadline_at,
      false as resets_prior_clock
    from public.batch_deadlines
    where batch_deadlines.batch_id = p_batch_id
  ),
  latest as (
    select
      batch_lifecycle_deadlines.deadline_kind,
      batch_lifecycle_deadlines.deadline_at,
      batch_lifecycle_deadlines.resets_prior_clock
    from public.batch_lifecycle_deadlines
    where batch_lifecycle_deadlines.batch_id = p_batch_id
    order by batch_lifecycle_deadlines.created_at desc
    limit 1
  )
  select jsonb_build_object(
    'deadline_kind', original.deadline_kind,
    'deadline_at',
      case
        when target.lifecycle_state in ('thawing', 'thawed')
          and latest.deadline_kind = 'discard_after'
          and latest.deadline_at is not null
          then least(original.deadline_at, latest.deadline_at)
        else original.deadline_at
      end,
    'quality_by_at',
      case
        when target.lifecycle_state = 'frozen'
          and latest.deadline_kind = 'quality_by'
          then latest.deadline_at
        else null
      end,
    'original_deadline_at', original.deadline_at
  )
  from target
  cross join original
  left join latest on true;
$$;

create or replace function public.perform_batch_transition(
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
declare
  caller_id uuid := (select auth.uid());
  candidate_batch record;
  target_batch public.batches%rowtype;
  existing_event public.batch_events%rowtype;
  locked_baby_id uuid;
  locked_revision_id text;
  event_type_value text;
  trusted_now timestamptz;
  ledger_portions integer;
  result_portions integer;
  target_state text;
  rule jsonb;
  deadline jsonb;
  inserted_event_id uuid;
  served_event public.batch_events%rowtype;
  corrected_event public.batch_events%rowtype;
  target_remaining integer;
  event_metadata jsonb;
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

  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
    or p_transition not in (
      'freeze',
      'begin_thaw',
      'mark_thawed',
      'return_untouched',
      'finish',
      'correct'
    ) then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'invalid_batch_transition'
    );
  end if;

  event_type_value := case p_transition
    when 'freeze' then 'frozen'
    when 'begin_thaw' then 'thaw_started'
    when 'mark_thawed' then 'thawed'
    when 'return_untouched' then 'returned_untouched'
    when 'finish' then 'finished'
    when 'correct' then 'corrected'
  end;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_idempotency_key::text, 0)
  );

  select batches.id, batches.baby_id
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

  select batches.*
    into target_batch
  from public.batches
  where batches.id = candidate_batch.id
    and batches.baby_id = candidate_batch.baby_id
  for update;

  select batch_events.*
    into existing_event
  from public.batch_events
  where batch_events.idempotency_key = p_idempotency_key;

  if existing_event.id is not null then
    if existing_event.batch_id = target_batch.id
      and existing_event.event_type = event_type_value
      and existing_event.actor_user_id = caller_id
      and existing_event.metadata->'request_payload' = p_payload then
      return jsonb_build_object(
        'status', 'applied',
        'transition', p_transition,
        'event_id', existing_event.id,
        'batch_id', existing_event.batch_id,
        'remaining_portions', existing_event.resulting_portions,
        'lifecycle_state',
          existing_event.metadata->>'resulting_state',
        'occurred_at', existing_event.occurred_at,
        'idempotent_retry', true
      );
    end if;

    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'idempotency_key_conflict'
    );
  end if;

  if p_transition in (
    'freeze',
    'begin_thaw',
    'mark_thawed',
    'return_untouched'
  ) then
    select content_revisions.id
      into locked_revision_id
    from public.content_revisions
    where content_revisions.id = target_batch.content_revision_id
    for update;

    if locked_revision_id is null
      or not exists (
        select 1
        from public.current_published_preparations() as published
        where published.revision_id = locked_revision_id
      ) then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'preparation_not_approved'
      );
    end if;
  end if;

  if target_batch.lifecycle_state in ('finished', 'discarded') then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'batch_terminal'
    );
  end if;

  ledger_portions := public.reconciled_batch_portions(target_batch.id);
  if p_transition = 'return_untouched'
    and p_payload->>'exposure_state'
      <> 'untouched_separately_stored' then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'portion_not_returnable'
    );
  end if;

  if ledger_portions <= 0
    and p_transition <> 'return_untouched' then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'batch_depleted'
    );
  end if;

  trusted_now := clock_timestamp();
  deadline := public.current_batch_deadline(target_batch.id);
  result_portions := ledger_portions;
  target_state := target_batch.lifecycle_state;
  event_metadata := jsonb_build_object(
    'request_payload', p_payload
  );

  if p_transition = 'freeze' then
    if target_batch.lifecycle_state <> 'refrigerated' then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'invalid_batch_transition'
      );
    end if;
    if ledger_portions <> target_batch.initial_portions then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'batch_not_untouched'
      );
    end if;
    if (deadline->>'original_deadline_at')::timestamptz <= trusted_now then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'batch_expired'
      );
    end if;
    rule := public.resolve_storage_transition_rule(
      target_batch.content_revision_id,
      'freeze',
      target_batch.lifecycle_state
    );
    target_state := 'frozen';

  elsif p_transition = 'begin_thaw' then
    if target_batch.lifecycle_state <> 'frozen' then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'invalid_batch_transition'
      );
    end if;
    if deadline->>'deadline_kind' = 'discard_after'
      and (deadline->>'deadline_at')::timestamptz <= trusted_now then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'batch_expired'
      );
    end if;
    rule := public.resolve_storage_transition_rule(
      target_batch.content_revision_id,
      'begin_thaw',
      target_batch.lifecycle_state
    );
    target_state := 'thawing';

  elsif p_transition = 'mark_thawed' then
    if target_batch.lifecycle_state <> 'thawing' then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'invalid_batch_transition'
      );
    end if;
    if deadline->>'deadline_kind' <> 'discard_after'
      or (deadline->>'deadline_at')::timestamptz <= trusted_now then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'batch_expired'
      );
    end if;
    select batch_events.*
      into existing_event
    from public.batch_events
    where batch_events.batch_id = target_batch.id
      and batch_events.event_type = 'thaw_started'
    order by batch_events.occurred_at desc
    limit 1;
    select to_jsonb(storage_transition_rules.*)
      into rule
    from public.storage_transition_rules
    where storage_transition_rules.id =
      existing_event.transition_rule_id;
    if rule is null
      or rule->>'method' is null
      or rule->>'clock_start_event' is null
      or rule->>'refreezing_policy' is null then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'transition_rule_unavailable'
      );
    end if;
    target_state := 'thawed';

  elsif p_transition = 'return_untouched' then
    if target_batch.lifecycle_state not in ('refrigerated', 'thawed') then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'invalid_batch_transition'
      );
    end if;
    select batch_events.*
      into served_event
    from public.batch_events
    where batch_events.id =
        public.try_uuid(p_payload->>'served_event_id')
      and batch_events.batch_id = target_batch.id
      and batch_events.event_type = 'served';
    if served_event.id is null
      or exists (
        select 1
        from public.batch_events
        where batch_events.event_type = 'returned_untouched'
          and batch_events.compensates_event_id = served_event.id
      ) then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'served_event_unavailable'
      );
    end if;
    if ledger_portions >= target_batch.initial_portions then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'batch_portion_limit'
      );
    end if;
    if deadline->>'deadline_kind' = 'discard_after'
      and (deadline->>'deadline_at')::timestamptz <= trusted_now then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'batch_expired'
      );
    end if;
    rule := public.resolve_storage_transition_rule(
      target_batch.content_revision_id,
      'return_untouched',
      target_batch.lifecycle_state
    );
    result_portions := ledger_portions + 1;

  elsif p_transition = 'finish' then
    result_portions := 0;
    target_state := 'finished';

  elsif p_transition = 'correct' then
    target_remaining :=
      public.try_integer(p_payload->>'target_remaining_portions');
    select batch_events.*
      into corrected_event
    from public.batch_events
    where batch_events.id =
        public.try_uuid(p_payload->>'corrects_event_id')
      and batch_events.batch_id = target_batch.id;
    if p_payload->>'reason' <> 'inventory_overcount'
      or target_remaining is null
      or target_remaining < 0
      or target_remaining >= ledger_portions
      or corrected_event.id is null
      or corrected_event.event_type not in (
        'prepared_or_opened',
        'returned_untouched'
      )
      or corrected_event.portion_delta <= 0
      or ledger_portions - target_remaining > (
        corrected_event.portion_delta
        - coalesce(
          (
            select sum(-corrections.portion_delta)
            from public.batch_events as corrections
            where corrections.event_type = 'corrected'
              and corrections.compensates_event_id = corrected_event.id
          ),
          0
        )
      ) then
      return jsonb_build_object(
        'status', 'rejected',
        'reason', 'invalid_correction'
      );
    end if;
    result_portions := target_remaining;
    if result_portions = 0 then
      target_state := 'finished';
    end if;
  end if;

  if p_transition in (
    'freeze',
    'begin_thaw',
    'return_untouched'
  ) and rule->>'status' <> 'ready' then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', coalesce(
        rule->>'reason',
        'transition_rule_unavailable'
      )
    );
  end if;

  event_metadata := event_metadata || jsonb_build_object(
    'resulting_state', target_state
  );
  if p_transition = 'return_untouched' then
    event_metadata := event_metadata || jsonb_build_object(
      'served_event_id', served_event.id,
      'exposure_state', p_payload->>'exposure_state'
    );
  end if;

  insert into public.batch_events (
    batch_id,
    event_type,
    occurred_at,
    actor_user_id,
    portion_delta,
    idempotency_key,
    resulting_portions,
    transition_rule_id,
    compensates_event_id,
    metadata
  ) values (
    target_batch.id,
    event_type_value,
    trusted_now,
    caller_id,
    result_portions - ledger_portions,
    p_idempotency_key,
    result_portions,
    case
      when p_transition in (
        'freeze',
        'begin_thaw',
        'mark_thawed',
        'return_untouched'
      ) then (rule->>'id')::text
      else null
    end,
    case
      when p_transition = 'return_untouched' then served_event.id
      when p_transition = 'correct' then corrected_event.id
      else null
    end,
    event_metadata
  )
  returning batch_events.id into inserted_event_id;

  update public.batches
  set
    remaining_portions = result_portions,
    lifecycle_state = target_state,
    storage_location = case
      when target_state in ('frozen', 'thawing') then 'freezer'
      else 'refrigerator'
    end
  where batches.id = target_batch.id;

  if p_transition in ('freeze', 'begin_thaw', 'mark_thawed')
    and (
      p_transition = 'freeze'
      or rule->>'clock_start_event' = event_type_value
    ) then
    insert into public.batch_lifecycle_deadlines (
      batch_id,
      start_event_id,
      transition_rule_id,
      deadline_kind,
      applied_duration_hours,
      reviewed_duration_min_hours,
      reviewed_duration_max_hours,
      deadline_at,
      resets_prior_clock
    ) values (
      target_batch.id,
      inserted_event_id,
      rule->>'id',
      rule->>'deadline_kind',
      public.try_integer(rule->>'duration_min_hours'),
      public.try_integer(rule->>'duration_min_hours'),
      public.try_integer(rule->>'duration_max_hours'),
      case
        when rule->>'deadline_kind' = 'informational' then null
        else trusted_now + make_interval(
          hours => public.try_integer(
            rule->>'duration_min_hours'
          )
        )
      end,
      coalesce((rule->>'resets_prior_clock')::boolean, false)
    );
  end if;

  return jsonb_build_object(
    'status', 'applied',
    'transition', p_transition,
    'event_id', inserted_event_id,
    'batch_id', target_batch.id,
    'remaining_portions', result_portions,
    'lifecycle_state', target_state,
    'occurred_at', trusted_now,
    'idempotent_retry', false
  );
end;
$$;

create or replace function public.project_batch_lifecycle(
  p_batch_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'batch_id', batches.id,
    'cached_remaining_portions', batches.remaining_portions,
    'ledger_remaining_portions',
      public.reconciled_batch_portions(batches.id),
    'projection_matches_ledger',
      batches.remaining_portions =
        public.reconciled_batch_portions(batches.id),
    'lifecycle_state', batches.lifecycle_state,
    'latest_event_state', coalesce(
      (
        select batch_events.metadata->>'resulting_state'
        from public.batch_events
        where batch_events.batch_id = batches.id
          and batch_events.metadata ? 'resulting_state'
        order by batch_events.occurred_at desc, batch_events.id desc
        limit 1
      ),
      'refrigerated'
    )
  )
  from public.batches
  join public.babies on babies.id = batches.baby_id
  join public.user_profiles
    on user_profiles.household_id = babies.household_id
  where batches.id = p_batch_id
    and babies.is_active
    and user_profiles.user_id = (select auth.uid());
$$;

create or replace function public.apply_discarded_batch_state()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.event_type = 'discarded' then
    update public.batches
    set lifecycle_state = 'discarded'
    where batches.id = new.batch_id;
  end if;
  return new;
end;
$$;

create trigger batch_events_apply_discarded_state
after insert on public.batch_events
for each row execute function public.apply_discarded_batch_state();

revoke all on function public.resolve_storage_transition_rule(
  text,
  text,
  text
) from public, anon, authenticated;
revoke all on function public.try_integer(text)
  from public, anon, authenticated;
revoke all on function public.current_batch_deadline(uuid)
  from public, anon, authenticated;
revoke all on function public.perform_batch_transition(
  uuid,
  text,
  jsonb,
  uuid
) from public, anon;
revoke all on function public.project_batch_lifecycle(uuid)
  from public, anon;

grant execute on function public.perform_batch_transition(
  uuid,
  text,
  jsonb,
  uuid
) to authenticated;
grant execute on function public.project_batch_lifecycle(uuid)
  to authenticated;

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
            'batch_id', inventory.batch_id,
            'preparation_id', inventory.preparation_id,
            'content_revision_id', inventory.content_revision_id,
            'preparation_name', inventory.preparation_name,
            'storage_location', inventory.storage_location,
            'lifecycle_state', inventory.lifecycle_state,
            'remaining_portions', inventory.ledger_portions,
            'prepared_or_opened_at',
              inventory.prepared_or_opened_at,
            'deadline_at', inventory.effective_deadline_at,
            'original_deadline_at', inventory.original_deadline_at,
            'deadline_kind', inventory.deadline_kind,
            'quality_by_at', inventory.quality_by_at,
            'storage_status', inventory.storage_status,
            'projection_matches_ledger',
              inventory.remaining_portions = inventory.ledger_portions,
            'rule_profile_id', inventory.rule_profile_id,
            'storage_rule_id', inventory.storage_rule_id,
            'applied_duration_hours',
              inventory.applied_duration_hours,
            'reviewed_duration_range_hours',
              jsonb_build_object(
                'minimum', inventory.reviewed_min_hours,
                'maximum', inventory.reviewed_max_hours
              ),
            'guidance', inventory.guidance,
            'reviewed_at', inventory.reviewed_at,
            'source_title', inventory.source_title,
            'source_url', inventory.source_url,
            'transition_method', inventory.transition_method,
            'refreezing_policy', inventory.refreezing_policy,
            'action_guidance', inventory.action_guidance,
            'action_method', inventory.action_method,
            'action_refreezing_policy',
              inventory.action_refreezing_policy,
            'action_return_policy', inventory.action_return_policy,
            'action_source_title', inventory.action_source_title,
            'action_source_url', inventory.action_source_url,
            'available_actions', inventory.available_actions,
            'return_served_event_id',
              inventory.return_served_event_id,
            'correction_event_id', inventory.correction_event_id
          )
          order by
            inventory.effective_deadline_at nulls last,
            inventory.batch_id
        ),
        '[]'::jsonb
      )
      from (
        select
          batches.id as batch_id,
          batches.preparation_id,
          batches.content_revision_id,
          preparations.name as preparation_name,
          batches.storage_location,
          batches.lifecycle_state,
          batches.remaining_portions,
          batches.initial_portions,
          batches.prepared_or_opened_at,
          ledger.portions as ledger_portions,
          batch_deadlines.deadline_at as original_deadline_at,
          (effective.value->>'deadline_at')::timestamptz
            as effective_deadline_at,
          effective.value->>'deadline_kind' as deadline_kind,
          (effective.value->>'quality_by_at')::timestamptz
            as quality_by_at,
          case
            when batches.lifecycle_state = 'finished'
              or ledger.portions = 0 then 'depleted'
            when (effective.value->>'deadline_at')::timestamptz
              <= reference_at then 'expired'
            when batches.lifecycle_state = 'frozen'
              and (effective.value->>'quality_by_at')::timestamptz
                <= reference_at then 'quality_due'
            when batches.lifecycle_state = 'frozen' then 'frozen'
            when batches.lifecycle_state = 'thawing' then 'thawing'
            when effective.value->>'deadline_kind' = 'discard_after'
              and (effective.value->>'deadline_at')::timestamptz
                <= reference_at + interval '24 hours' then 'use_today'
            else 'ready'
          end as storage_status,
          storage_rule_profiles.id as rule_profile_id,
          storage_rules.id as storage_rule_id,
          case
            when batches.lifecycle_state in ('thawing', 'thawed')
              and lifecycle_deadline.transition_rule_id =
                active_thaw_rule.id
              then lifecycle_deadline.applied_duration_hours
            when batches.lifecycle_state in ('thawing', 'thawed')
              then null
            when lifecycle_deadline.id is not null
              then lifecycle_deadline.applied_duration_hours
            else batch_deadlines.applied_duration_hours
          end as applied_duration_hours,
          case
            when batches.lifecycle_state in ('thawing', 'thawed')
              then active_thaw_rule.duration_min_hours
            when lifecycle_deadline.id is not null
              then lifecycle_deadline.reviewed_duration_min_hours
            else batch_deadlines.reviewed_duration_min_hours
          end as reviewed_min_hours,
          case
            when batches.lifecycle_state in ('thawing', 'thawed')
              then active_thaw_rule.duration_max_hours
            when lifecycle_deadline.id is not null
              then lifecycle_deadline.reviewed_duration_max_hours
            else batch_deadlines.reviewed_duration_max_hours
          end as reviewed_max_hours,
          case
            when batches.lifecycle_state in ('thawing', 'thawed')
              then active_thaw_rule.guidance
            else coalesce(transition_rule.guidance, storage_rules.guidance)
          end as guidance,
          case
            when batches.lifecycle_state in ('thawing', 'thawed')
              then active_thaw_rule.reviewed_at
            else coalesce(
              transition_rule.reviewed_at,
              storage_rule_profiles.reviewed_at
            )
          end as reviewed_at,
          coalesce(active_thaw_sources.title, transition_sources.title, sources.title)
            as source_title,
          coalesce(active_thaw_sources.url, transition_sources.url, sources.url)
            as source_url,
          active_thaw_rule.method as transition_method,
          active_thaw_rule.refreezing_policy,
          case
            when batches.lifecycle_state = 'frozen'
              and thaw_rule.id is not null
              and (effective.value->>'deadline_at')::timestamptz
                > reference_at
              then thaw_rule.guidance
            when return_event.id is not null
              and return_rule.id is not null
              and (effective.value->>'deadline_at')::timestamptz
                > reference_at
              then return_rule.guidance
            when batches.lifecycle_state = 'refrigerated'
              and ledger.portions = batches.initial_portions
              and batch_deadlines.deadline_at > reference_at
              and freeze_rule.id is not null
              then freeze_rule.guidance
            else null
          end as action_guidance,
          case
            when batches.lifecycle_state = 'frozen'
              and thaw_rule.id is not null
              and (effective.value->>'deadline_at')::timestamptz
                > reference_at
              then thaw_rule.method
            else null
          end as action_method,
          case
            when batches.lifecycle_state = 'frozen'
              and thaw_rule.id is not null
              and (effective.value->>'deadline_at')::timestamptz
                > reference_at
              then thaw_rule.refreezing_policy
            else null
          end as action_refreezing_policy,
          case
            when return_event.id is not null
              and return_rule.id is not null
              and (effective.value->>'deadline_at')::timestamptz
                > reference_at
              then return_rule.return_policy
            else null
          end as action_return_policy,
          case
            when batches.lifecycle_state = 'frozen'
              and thaw_rule.id is not null
              and (effective.value->>'deadline_at')::timestamptz
                > reference_at
              then thaw_sources.title
            when return_event.id is not null
              and return_rule.id is not null
              and (effective.value->>'deadline_at')::timestamptz
                > reference_at
              then return_sources.title
            when batches.lifecycle_state = 'refrigerated'
              and ledger.portions = batches.initial_portions
              and batch_deadlines.deadline_at > reference_at
              and freeze_rule.id is not null
              then freeze_sources.title
            else null
          end as action_source_title,
          case
            when batches.lifecycle_state = 'frozen'
              and thaw_rule.id is not null
              and (effective.value->>'deadline_at')::timestamptz
                > reference_at
              then thaw_sources.url
            when return_event.id is not null
              and return_rule.id is not null
              and (effective.value->>'deadline_at')::timestamptz
                > reference_at
              then return_sources.url
            when batches.lifecycle_state = 'refrigerated'
              and ledger.portions = batches.initial_portions
              and batch_deadlines.deadline_at > reference_at
              and freeze_rule.id is not null
              then freeze_sources.url
            else null
          end as action_source_url,
          return_event.id as return_served_event_id,
          correction_event.id as correction_event_id,
          (
            case
              when batches.lifecycle_state = 'refrigerated'
                and ledger.portions = batches.initial_portions
                and batch_deadlines.deadline_at > reference_at
                and freeze_rule.id is not null
                then jsonb_build_array('freeze')
              else '[]'::jsonb
            end
            ||
            case
              when batches.lifecycle_state = 'frozen'
                and thaw_rule.id is not null
                and (effective.value->>'deadline_at')::timestamptz
                  > reference_at
                then jsonb_build_array('begin_thaw')
              else '[]'::jsonb
            end
            ||
            case
              when batches.lifecycle_state = 'thawing'
                and active_thaw_rule.id is not null
                and (effective.value->>'deadline_at')::timestamptz
                  > reference_at
                then jsonb_build_array('mark_thawed')
              else '[]'::jsonb
            end
            ||
            case
              when return_event.id is not null
                and return_rule.id is not null
                and effective.value->>'deadline_kind' = 'discard_after'
                and (effective.value->>'deadline_at')::timestamptz
                  > reference_at
                then jsonb_build_array('return_untouched')
              else '[]'::jsonb
            end
            ||
            case
              when ledger.portions > 0
                then jsonb_build_array('finish')
              else '[]'::jsonb
            end
            ||
            case
              when ledger.portions > 0
                and correction_event.id is not null
                then jsonb_build_array('correct')
              else '[]'::jsonb
            end
            ||
            case
              when ledger.portions > 0
                then jsonb_build_array('discard')
              else '[]'::jsonb
            end
          ) as available_actions
        from public.batches
        join public.preparations
          on preparations.id = batches.preparation_id
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
        cross join lateral (
          select public.reconciled_batch_portions(batches.id)
            as portions
        ) as ledger
        cross join lateral (
          select public.current_batch_deadline(batches.id) as value
        ) as effective
        left join lateral (
          select batch_lifecycle_deadlines.*
          from public.batch_lifecycle_deadlines
          where batch_lifecycle_deadlines.batch_id = batches.id
          order by batch_lifecycle_deadlines.created_at desc
          limit 1
        ) as lifecycle_deadline on true
        left join public.storage_transition_rules as transition_rule
          on transition_rule.id =
            lifecycle_deadline.transition_rule_id
        left join public.sources as transition_sources
          on transition_sources.id = transition_rule.source_id
        left join lateral (
          select batch_events.transition_rule_id
          from public.batch_events
          where batch_events.batch_id = batches.id
            and batch_events.event_type = 'thaw_started'
          order by batch_events.occurred_at desc, batch_events.id desc
          limit 1
        ) as active_thaw_event on true
        left join public.storage_transition_rules as active_thaw_rule
          on active_thaw_rule.id = active_thaw_event.transition_rule_id
        left join public.sources as active_thaw_sources
          on active_thaw_sources.id = active_thaw_rule.source_id
        left join public.storage_transition_rules as freeze_rule
          on freeze_rule.content_revision_id =
              batches.content_revision_id
          and freeze_rule.transition_kind = 'freeze'
          and freeze_rule.from_state = batches.lifecycle_state
          and exists (
            select 1
            from public.current_published_preparations() as published
            where published.revision_id =
              batches.content_revision_id
          )
        left join public.sources as freeze_sources
          on freeze_sources.id = freeze_rule.source_id
        left join public.storage_transition_rules as thaw_rule
          on thaw_rule.content_revision_id =
              batches.content_revision_id
          and thaw_rule.transition_kind = 'begin_thaw'
          and thaw_rule.from_state = batches.lifecycle_state
          and exists (
            select 1
            from public.current_published_preparations() as published
            where published.revision_id =
              batches.content_revision_id
          )
        left join public.sources as thaw_sources
          on thaw_sources.id = thaw_rule.source_id
        left join lateral (
          select batch_events.*
          from public.batch_events
          where batch_events.batch_id = batches.id
            and batch_events.event_type = 'served'
            and not exists (
              select 1
              from public.batch_events as returned
              where returned.event_type = 'returned_untouched'
                and returned.compensates_event_id = batch_events.id
            )
          order by batch_events.occurred_at desc
          limit 1
        ) as return_event on true
        left join public.storage_transition_rules as return_rule
          on return_rule.content_revision_id =
              batches.content_revision_id
          and return_rule.transition_kind = 'return_untouched'
          and return_rule.from_state = batches.lifecycle_state
          and exists (
            select 1
            from public.current_published_preparations() as published
            where published.revision_id =
              batches.content_revision_id
          )
        left join public.sources as return_sources
          on return_sources.id = return_rule.source_id
        left join lateral (
          select batch_events.id
          from public.batch_events
          where batch_events.batch_id = batches.id
            and batch_events.event_type in (
              'prepared_or_opened',
              'returned_untouched'
            )
            and batch_events.portion_delta > coalesce(
              (
                select sum(-corrections.portion_delta)
                from public.batch_events as corrections
                where corrections.event_type = 'corrected'
                  and corrections.compensates_event_id = batch_events.id
              ),
              0
            )
          order by batch_events.occurred_at desc
          limit 1
        ) as correction_event on true
        where batches.baby_id = active_baby.id
          and batches.lifecycle_state <> 'discarded'
      ) as inventory
    )
  );
end;
$$;

alter function public.serve_planned_portion(uuid, uuid, uuid)
  rename to serve_planned_portion_ticket_09;

revoke all on function public.serve_planned_portion_ticket_09(
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
  candidate_baby_id uuid;
  locked_baby_id uuid;
  target_batch public.batches%rowtype;
  effective_deadline jsonb;
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
    return public.serve_planned_portion_ticket_09(
      p_meal_component_id,
      p_batch_id,
      p_idempotency_key
    );
  end if;

  select batches.baby_id
    into candidate_baby_id
  from public.batches
  join public.babies on babies.id = batches.baby_id
  join public.user_profiles
    on user_profiles.household_id = babies.household_id
  where batches.id = p_batch_id
    and babies.is_active
    and user_profiles.user_id = caller_id;

  if candidate_baby_id is null then
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
  where babies.id = candidate_baby_id
    and babies.is_active
    and user_profiles.user_id = caller_id
  for update of babies;

  if locked_baby_id is null then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'batch_unavailable'
    );
  end if;

  select batches.*
    into target_batch
  from public.batches
  where batches.id = p_batch_id
    and batches.baby_id = locked_baby_id
  for update of batches;

  if target_batch.id is null then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'batch_unavailable'
    );
  end if;

  if target_batch.lifecycle_state not in ('refrigerated', 'thawed') then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'batch_not_ready_to_serve'
    );
  end if;

  effective_deadline := public.current_batch_deadline(target_batch.id);

  if effective_deadline->>'deadline_kind' <> 'discard_after'
    or (effective_deadline->>'deadline_at')::timestamptz
      <= statement_timestamp() then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'batch_expired'
    );
  end if;

  return public.serve_planned_portion_ticket_09(
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

  select meals.id, meals.local_date, meals.meal_slot
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
            when component.ready_batch_id is not null then 'ready'
            when component.frozen_batch_id is not null then 'thaw_required'
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
          'batch_id',
            coalesce(component.ready_batch_id, component.frozen_batch_id),
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
          ready_batch.id as ready_batch_id,
          frozen_batch.id as frozen_batch_id,
          coalesce(
            ready_batch.remaining_portions,
            frozen_batch.remaining_portions
          ) as remaining_portions,
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
            (effective.value->>'deadline_at')::timestamptz as deadline_at,
            coalesce(transition_rule.guidance, storage_rules.guidance)
              as guidance,
            coalesce(transition_sources.title, sources.title)
              as source_title,
            coalesce(transition_sources.url, sources.url)
              as source_url,
            coalesce(
              transition_rule.reviewed_at,
              storage_rule_profiles.reviewed_at
            ) as reviewed_at
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
          cross join lateral (
            select public.current_batch_deadline(batches.id) as value
          ) as effective
          left join lateral (
            select batch_lifecycle_deadlines.transition_rule_id
            from public.batch_lifecycle_deadlines
            where batch_lifecycle_deadlines.batch_id = batches.id
            order by batch_lifecycle_deadlines.created_at desc
            limit 1
          ) as lifecycle_deadline on true
          left join public.storage_transition_rules as transition_rule
            on transition_rule.id =
              lifecycle_deadline.transition_rule_id
          left join public.sources as transition_sources
            on transition_sources.id = transition_rule.source_id
          where batches.baby_id = active_baby.id
            and batches.preparation_id =
              meal_components.preparation_id
            and batches.content_revision_id =
              meal_components.revision_id
            and batches.lifecycle_state in ('refrigerated', 'thawed')
            and effective.value->>'deadline_kind' = 'discard_after'
            and (effective.value->>'deadline_at')::timestamptz
              > trusted_now
            and public.reconciled_batch_portions(batches.id) > 0
          order by
            (effective.value->>'deadline_at')::timestamptz,
            batches.id
          limit 1
        ) as ready_batch on true
        left join lateral (
          select
            batches.id,
            public.reconciled_batch_portions(batches.id)
              as remaining_portions
          from public.batches
          cross join lateral (
            select public.current_batch_deadline(batches.id) as value
          ) as frozen_deadline
          where batches.baby_id = active_baby.id
            and batches.preparation_id =
              meal_components.preparation_id
            and batches.content_revision_id =
              meal_components.revision_id
            and batches.lifecycle_state in ('frozen', 'thawing')
            and (frozen_deadline.value->>'deadline_at')::timestamptz
              > trusted_now
            and public.reconciled_batch_portions(batches.id) > 0
          order by batches.prepared_or_opened_at, batches.id
          limit 1
        ) as frozen_batch on ready_batch.id is null
        where meal_components.meal_id = target_meal.id
      ) as component
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
          (effective.value->>'deadline_at')::timestamptz as deadline_at,
          coalesce(transition_rule.guidance, storage_rules.guidance)
            as guidance,
          coalesce(
            transition_rule.reviewed_at,
            storage_rule_profiles.reviewed_at
          ) as reviewed_at,
          coalesce(transition_sources.title, sources.title)
            as source_title,
          coalesce(transition_sources.url, sources.url)
            as source_url,
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
        cross join lateral (
          select public.current_batch_deadline(batches.id) as value
        ) as effective
        left join lateral (
          select batch_lifecycle_deadlines.transition_rule_id
          from public.batch_lifecycle_deadlines
          where batch_lifecycle_deadlines.batch_id = batches.id
          order by batch_lifecycle_deadlines.created_at desc
          limit 1
        ) as lifecycle_deadline on true
        left join public.storage_transition_rules as transition_rule
          on transition_rule.id = lifecycle_deadline.transition_rule_id
        left join public.sources as transition_sources
          on transition_sources.id = transition_rule.source_id
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
          and batches.lifecycle_state in ('refrigerated', 'thawed')
          and effective.value->>'deadline_kind' = 'discard_after'
          and (effective.value->>'deadline_at')::timestamptz > trusted_now
          and (effective.value->>'deadline_at')::timestamptz
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
        order by
          (effective.value->>'deadline_at')::timestamptz,
          batches.id
        limit 3
      ) as candidate
    )
  );
end;
$$;

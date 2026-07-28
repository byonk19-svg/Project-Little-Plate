create table public.reaction_guidance_revisions (
  id text primary key,
  guidance_key text not null check (btrim(guidance_key) <> ''),
  version integer not null check (version > 0),
  status text not null check (status in ('draft', 'in_review', 'approved')),
  guidance text not null check (btrim(guidance) <> ''),
  source_id text not null references public.sources (id),
  reviewer_role text,
  reviewed_at date,
  approved_at date,
  next_review_at date,
  created_at timestamptz not null default now(),
  unique (guidance_key, version),
  check (
    status <> 'in_review'
    or (reviewer_role is not null and reviewed_at is not null)
  ),
  check (
    status <> 'approved'
    or (
      reviewer_role is not null
      and btrim(reviewer_role) <> ''
      and reviewed_at is not null
      and approved_at is not null
      and next_review_at is not null
      and next_review_at >= approved_at
    )
  )
);

create table public.reaction_guidance_retirements (
  guidance_revision_id text primary key
    references public.reaction_guidance_revisions (id),
  retired_at date not null,
  reason text not null check (btrim(reason) <> '')
);

create table public.baby_food_reaction_events (
  id uuid primary key default gen_random_uuid(),
  baby_id uuid not null references public.babies (id) on delete cascade,
  food_id text not null references public.foods (id),
  served_event_id uuid references public.batch_events (id),
  event_type text not null check (event_type in ('reported', 'resolved')),
  restriction_before text not null,
  restriction_after text not null,
  preference text check (preference in ('liked', 'neutral', 'disliked')),
  private_description text
    check (
      private_description is null
      or (
        btrim(private_description) <> ''
        and char_length(private_description) <= 2000
      )
    ),
  guidance_revision_id text
    references public.reaction_guidance_revisions (id),
  actor_user_id uuid not null,
  idempotency_key uuid not null unique,
  occurred_at timestamptz not null default statement_timestamp(),
  check (
    (
      event_type = 'reported'
      and served_event_id is not null
      and restriction_before = 'no_known_restriction'
      and restriction_after = 'reaction_reported'
      and guidance_revision_id is not null
    )
    or
    (
      event_type = 'resolved'
      and served_event_id is null
      and restriction_before = 'reaction_reported'
      and restriction_after = 'no_known_restriction'
      and private_description is null
      and guidance_revision_id is null
    )
  )
);

create unique index baby_food_reaction_reported_serving_idx
  on public.baby_food_reaction_events (served_event_id)
  where event_type = 'reported';

alter table public.reaction_guidance_revisions enable row level security;
alter table public.reaction_guidance_retirements enable row level security;
alter table public.baby_food_reaction_events enable row level security;

revoke all on table public.reaction_guidance_revisions
  from public, anon, authenticated;
revoke all on table public.reaction_guidance_retirements
  from public, anon, authenticated;
revoke all on table public.baby_food_reaction_events
  from public, anon, authenticated;

grant select, insert, update, delete
  on table public.reaction_guidance_revisions to service_role;
grant select, insert, update, delete
  on table public.reaction_guidance_retirements to service_role;
grant select on table public.baby_food_reaction_events to authenticated;
grant select, insert, update, delete
  on table public.baby_food_reaction_events to service_role;

create policy "Caregivers can read their baby's reaction history"
  on public.baby_food_reaction_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.babies
      join public.user_profiles
        on user_profiles.household_id = babies.household_id
      where babies.id = baby_food_reaction_events.baby_id
        and user_profiles.user_id = (select auth.uid())
    )
  );

create or replace function public.prevent_reviewed_reaction_guidance_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'approved' then
    raise exception 'Approved reaction guidance is append-only'
      using errcode = '55000';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger reaction_guidance_revisions_append_only
before update or delete on public.reaction_guidance_revisions
for each row execute function public.prevent_reviewed_reaction_guidance_changes();

create or replace function public.serialize_reaction_guidance_publication()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.guidance_key = 'post-serve-reaction-care-direction'
    and new.status = 'approved' then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('post-serve-reaction-guidance', 0)
    );
  end if;

  return new;
end;
$$;

create trigger reaction_guidance_revisions_serialize_publication
before insert or update on public.reaction_guidance_revisions
for each row
execute function public.serialize_reaction_guidance_publication();

create or replace function public.prevent_reaction_guidance_retirement_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Reaction guidance retirements are append-only'
    using errcode = '55000';
end;
$$;

create trigger reaction_guidance_retirements_append_only
before update or delete on public.reaction_guidance_retirements
for each row
execute function public.prevent_reaction_guidance_retirement_changes();

create or replace function public.serialize_reaction_guidance_retirement()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('post-serve-reaction-guidance', 0)
  );

  perform 1
  from public.reaction_guidance_revisions
  where reaction_guidance_revisions.id = new.guidance_revision_id
  for update;

  return new;
end;
$$;

create trigger reaction_guidance_retirements_serialize
before insert on public.reaction_guidance_retirements
for each row
execute function public.serialize_reaction_guidance_retirement();

create or replace function public.prevent_reaction_guidance_source_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new is not distinct from old then
    return new;
  end if;

  if exists (
    select 1
    from public.reaction_guidance_revisions
    where reaction_guidance_revisions.source_id = old.id
      and reaction_guidance_revisions.status = 'approved'
  ) then
    raise exception 'Approved reaction guidance sources are append-only'
      using errcode = '55000';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger sources_reaction_guidance_append_only
before update or delete on public.sources
for each row execute function public.prevent_reaction_guidance_source_changes();

create or replace function public.prevent_reaction_event_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Reaction history is append-only'
    using errcode = '55000';
end;
$$;

create trigger baby_food_reaction_events_append_only
before update or delete on public.baby_food_reaction_events
for each row execute function public.prevent_reaction_event_changes();

create or replace function public.validate_reported_reaction_serving()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.event_type = 'reported'
    and not exists (
      select 1
      from public.batch_events
      join public.batches on batches.id = batch_events.batch_id
      join public.preparations
        on preparations.id = batches.preparation_id
      where batch_events.id = new.served_event_id
        and batch_events.event_type = 'served'
        and batches.baby_id = new.baby_id
        and preparations.food_id = new.food_id
    ) then
    raise exception 'Reaction report serving does not match baby and food'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger baby_food_reaction_events_validate_serving
before insert on public.baby_food_reaction_events
for each row execute function public.validate_reported_reaction_serving();

create or replace function public.protect_batch_event_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (
    new.baby_id is distinct from old.baby_id
    or new.preparation_id is distinct from old.preparation_id
  ) and exists (
    select 1
    from public.batch_events
    where batch_events.batch_id = old.id
  ) then
    raise exception 'Batch identity is immutable after its first event'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

create trigger batches_protect_event_identity
before update on public.batches
for each row execute function public.protect_batch_event_identity();

create or replace function public.import_reaction_guidance_fixture(
  p_records jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  guidance_record jsonb;
  existing public.reaction_guidance_revisions%rowtype;
  imported_count integer := 0;
begin
  if p_records is null or jsonb_typeof(p_records) <> 'array' then
    raise exception 'Reaction guidance fixture must be an array'
      using errcode = '22023';
  end if;

  if jsonb_array_length(p_records) > 25 then
    raise exception 'Reaction guidance fixture is too large'
      using errcode = '22023';
  end if;

  for guidance_record in
    select value from jsonb_array_elements(p_records)
  loop
    if nullif(btrim(guidance_record->>'id'), '') is null
      or nullif(btrim(guidance_record->>'guidance_key'), '') is null
      or public.try_integer(guidance_record->>'version') is null
      or guidance_record->>'status' not in ('draft', 'in_review', 'approved')
      or nullif(btrim(guidance_record->>'guidance'), '') is null
      or nullif(btrim(guidance_record->>'source_id'), '') is null then
      raise exception 'Reaction guidance fixture is incomplete'
        using errcode = '22023';
    end if;

    if not exists (
      select 1
      from public.sources
      where sources.id = guidance_record->>'source_id'
    ) then
      raise exception 'Reaction guidance source is unavailable'
        using errcode = '22023';
    end if;

    if guidance_record->>'status' = 'approved'
      and (
        nullif(btrim(guidance_record->>'reviewer_role'), '') is null
        or public.try_date(guidance_record->>'reviewed_at') is null
        or public.try_date(guidance_record->>'approved_at') is null
        or public.try_date(guidance_record->>'next_review_at') is null
      ) then
      raise exception 'Approved reaction guidance requires review metadata'
        using errcode = '22023';
    end if;

    select *
      into existing
    from public.reaction_guidance_revisions
    where reaction_guidance_revisions.id = guidance_record->>'id';

    if existing.id is not null then
      if existing.guidance_key <> guidance_record->>'guidance_key'
        or existing.version <>
          public.try_integer(guidance_record->>'version')
        or existing.status <> guidance_record->>'status'
        or existing.guidance <> guidance_record->>'guidance'
        or existing.source_id <> guidance_record->>'source_id'
        or existing.reviewer_role is distinct from
          nullif(btrim(guidance_record->>'reviewer_role'), '')
        or existing.reviewed_at is distinct from
          public.try_date(guidance_record->>'reviewed_at')
        or existing.approved_at is distinct from
          public.try_date(guidance_record->>'approved_at')
        or existing.next_review_at is distinct from
          public.try_date(guidance_record->>'next_review_at') then
        raise exception 'Reaction guidance retry does not match'
          using errcode = '22023';
      end if;
      continue;
    end if;

    insert into public.reaction_guidance_revisions (
      id,
      guidance_key,
      version,
      status,
      guidance,
      source_id,
      reviewer_role,
      reviewed_at,
      approved_at,
      next_review_at
    ) values (
      guidance_record->>'id',
      guidance_record->>'guidance_key',
      public.try_integer(guidance_record->>'version'),
      guidance_record->>'status',
      guidance_record->>'guidance',
      guidance_record->>'source_id',
      nullif(btrim(guidance_record->>'reviewer_role'), ''),
      public.try_date(guidance_record->>'reviewed_at'),
      public.try_date(guidance_record->>'approved_at'),
      public.try_date(guidance_record->>'next_review_at')
    );
    imported_count := imported_count + 1;
  end loop;

  return jsonb_build_object(
    'status', 'imported',
    'inserted_count', imported_count
  );
end;
$$;

revoke all on function public.import_reaction_guidance_fixture(jsonb)
  from public, anon, authenticated;
grant execute on function public.import_reaction_guidance_fixture(jsonb)
  to service_role;

create or replace function public.get_reaction_report_context(
  p_served_event_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  served record;
  reviewed record;
begin
  if caller_id is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  select
    batch_events.id as served_event_id,
    batches.baby_id,
    foods.id as food_id,
    foods.name as food_name
    into served
  from public.batch_events
  join public.batches on batches.id = batch_events.batch_id
  join public.preparations on preparations.id = batches.preparation_id
  join public.foods on foods.id = preparations.food_id
  join public.babies on babies.id = batches.baby_id
  join public.user_profiles
    on user_profiles.household_id = babies.household_id
  where batch_events.id = p_served_event_id
    and batch_events.event_type = 'served'
    and babies.is_active
    and user_profiles.user_id = caller_id;

  if served.served_event_id is null then
    return jsonb_build_object(
      'status', 'unavailable',
      'reason', 'served_event_unavailable'
    );
  end if;

  if exists (
    select 1
    from public.baby_food_reaction_events
    where baby_food_reaction_events.served_event_id = p_served_event_id
      and baby_food_reaction_events.event_type = 'reported'
  ) then
    return jsonb_build_object(
      'status', 'unavailable',
      'reason', 'reaction_already_reported'
    );
  end if;

  select
    guidance.id,
    guidance.guidance,
    guidance.reviewed_at,
    sources.title as source_title,
    sources.url as source_url
    into reviewed
  from public.reaction_guidance_revisions as guidance
  join public.sources on sources.id = guidance.source_id
  where guidance.guidance_key = 'post-serve-reaction-care-direction'
    and guidance.status = 'approved'
    and not exists (
      select 1
      from public.reaction_guidance_retirements as retirements
      where retirements.guidance_revision_id = guidance.id
    )
  order by guidance.version desc, guidance.id
  limit 1;

  if reviewed.id is null then
    return jsonb_build_object(
      'status', 'unavailable',
      'reason', 'reviewed_guidance_unavailable'
    );
  end if;

  return jsonb_build_object(
    'status', 'ready',
    'served_event_id', served.served_event_id,
    'food_id', served.food_id,
    'food_name', served.food_name,
    'guidance_revision_id', reviewed.id,
    'guidance', reviewed.guidance,
    'source_title', reviewed.source_title,
    'source_url', reviewed.source_url,
    'reviewed_at', reviewed.reviewed_at
  );
end;
$$;

revoke all on function public.get_reaction_report_context(uuid)
  from public, anon;
grant execute on function public.get_reaction_report_context(uuid)
  to authenticated;

create or replace function public.report_food_reaction(
  p_served_event_id uuid,
  p_guidance_revision_id text,
  p_preference text,
  p_private_description text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  candidate record;
  existing public.baby_food_reaction_events%rowtype;
  current_restriction text;
  normalized_description text :=
    nullif(btrim(p_private_description), '');
  inserted_event_id uuid;
  occurred timestamptz := statement_timestamp();
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

  if p_preference is not null
    and p_preference not in ('liked', 'neutral', 'disliked') then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'preference_invalid'
    );
  end if;

  if normalized_description is not null
    and char_length(normalized_description) > 2000 then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'private_description_too_long'
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_idempotency_key::text, 0)
  );

  select *
    into existing
  from public.baby_food_reaction_events
  where baby_food_reaction_events.idempotency_key = p_idempotency_key;

  if existing.id is not null then
    if existing.actor_user_id = caller_id
      and existing.event_type = 'reported'
      and existing.served_event_id = p_served_event_id
      and existing.guidance_revision_id = p_guidance_revision_id
      and existing.preference is not distinct from p_preference
      and existing.private_description is not distinct from
        normalized_description
      and exists (
        select 1
        from public.babies
        join public.user_profiles
          on user_profiles.household_id = babies.household_id
        where babies.id = existing.baby_id
          and user_profiles.user_id = caller_id
      ) then
      return jsonb_build_object(
        'status', 'reported',
        'event_id', existing.id,
        'food_id', existing.food_id,
        'restriction_status', existing.restriction_after,
        'preference', existing.preference,
        'reported_at', existing.occurred_at,
        'idempotent_retry', true
      );
    end if;

    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'idempotency_key_conflict'
    );
  end if;

  select
    batch_events.id as served_event_id,
    batches.baby_id,
    foods.id as food_id
    into candidate
  from public.batch_events
  join public.batches on batches.id = batch_events.batch_id
  join public.preparations on preparations.id = batches.preparation_id
  join public.foods on foods.id = preparations.food_id
  join public.babies on babies.id = batches.baby_id
  join public.user_profiles
    on user_profiles.household_id = babies.household_id
  where batch_events.id = p_served_event_id
    and batch_events.event_type = 'served'
    and babies.is_active
    and user_profiles.user_id = caller_id;

  if candidate.served_event_id is null then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'served_event_unavailable'
    );
  end if;

  perform 1
  from public.babies
  where babies.id = candidate.baby_id
  for update;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('post-serve-reaction-guidance', 0)
  );

  perform 1
  from public.reaction_guidance_revisions as guidance
  where guidance.guidance_key = 'post-serve-reaction-care-direction'
    and guidance.status = 'approved'
    and not exists (
      select 1
      from public.reaction_guidance_retirements as retirements
      where retirements.guidance_revision_id = guidance.id
    )
  order by guidance.version desc, guidance.id
  limit 1
  for update;

  if not found
    or not exists (
      select 1
      from public.reaction_guidance_revisions as guidance
      where guidance.id = p_guidance_revision_id
        and guidance.guidance_key =
          'post-serve-reaction-care-direction'
        and guidance.status = 'approved'
        and not exists (
          select 1
          from public.reaction_guidance_retirements as retirements
          where retirements.guidance_revision_id = guidance.id
        )
        and guidance.version = (
          select max(current_guidance.version)
          from public.reaction_guidance_revisions as current_guidance
          where current_guidance.guidance_key =
            'post-serve-reaction-care-direction'
            and current_guidance.status = 'approved'
            and not exists (
              select 1
              from public.reaction_guidance_retirements as retirements
              where retirements.guidance_revision_id =
                current_guidance.id
            )
        )
    ) then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'reviewed_guidance_unavailable'
    );
  end if;

  if exists (
    select 1
    from public.baby_food_reaction_events
    where baby_food_reaction_events.served_event_id = p_served_event_id
      and baby_food_reaction_events.event_type = 'reported'
  ) then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'reaction_already_reported'
    );
  end if;

  select baby_food_restrictions.status
    into current_restriction
  from public.baby_food_restrictions
  where baby_food_restrictions.baby_id = candidate.baby_id
    and baby_food_restrictions.food_id = candidate.food_id
  for update;

  if current_restriction = 'reaction_reported' then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'reaction_block_already_active'
    );
  end if;

  if current_restriction is distinct from 'no_known_restriction' then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'food_already_restricted'
    );
  end if;

  update public.baby_food_restrictions
  set status = 'reaction_reported',
      updated_at = occurred
  where baby_food_restrictions.baby_id = candidate.baby_id
    and baby_food_restrictions.food_id = candidate.food_id;

  if p_preference is not null then
    insert into public.baby_food_exposures (
      baby_id,
      food_id,
      state,
      updated_at
    ) values (
      candidate.baby_id,
      candidate.food_id,
      p_preference,
      occurred
    )
    on conflict (baby_id, food_id)
    do update set
      state = excluded.state,
      updated_at = excluded.updated_at;
  end if;

  insert into public.baby_food_reaction_events (
    baby_id,
    food_id,
    served_event_id,
    event_type,
    restriction_before,
    restriction_after,
    preference,
    private_description,
    guidance_revision_id,
    actor_user_id,
    idempotency_key,
    occurred_at
  ) values (
    candidate.baby_id,
    candidate.food_id,
    p_served_event_id,
    'reported',
    current_restriction,
    'reaction_reported',
    p_preference,
    normalized_description,
    p_guidance_revision_id,
    caller_id,
    p_idempotency_key,
    occurred
  )
  returning id into inserted_event_id;

  return jsonb_build_object(
    'status', 'reported',
    'event_id', inserted_event_id,
    'food_id', candidate.food_id,
    'restriction_status', 'reaction_reported',
    'preference', p_preference,
    'reported_at', occurred,
    'idempotent_retry', false
  );
end;
$$;

revoke all on function public.report_food_reaction(
  uuid, text, text, text, uuid
) from public, anon;
grant execute on function public.report_food_reaction(
  uuid, text, text, text, uuid
) to authenticated;

create or replace function public.resolve_food_reaction(
  p_food_id text,
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
  existing public.baby_food_reaction_events%rowtype;
  current_restriction text;
  inserted_event_id uuid;
  occurred timestamptz := statement_timestamp();
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

  select *
    into existing
  from public.baby_food_reaction_events
  where baby_food_reaction_events.idempotency_key = p_idempotency_key;

  if existing.id is not null then
    if existing.actor_user_id = caller_id
      and existing.event_type = 'resolved'
      and existing.food_id = p_food_id
      and exists (
        select 1
        from public.babies
        join public.user_profiles
          on user_profiles.household_id = babies.household_id
        where babies.id = existing.baby_id
          and user_profiles.user_id = caller_id
      ) then
      return jsonb_build_object(
        'status', 'resolved',
        'event_id', existing.id,
        'food_id', existing.food_id,
        'restriction_status', existing.restriction_after,
        'resolved_at', existing.occurred_at,
        'idempotent_retry', true
      );
    end if;

    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'idempotency_key_conflict'
    );
  end if;

  select babies.id
    into active_baby_id
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

  select baby_food_restrictions.status
    into current_restriction
  from public.baby_food_restrictions
  where baby_food_restrictions.baby_id = active_baby_id
    and baby_food_restrictions.food_id = p_food_id
  for update;

  if current_restriction is distinct from 'reaction_reported' then
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'reaction_block_not_active'
    );
  end if;

  update public.baby_food_restrictions
  set status = 'no_known_restriction',
      updated_at = occurred
  where baby_food_restrictions.baby_id = active_baby_id
    and baby_food_restrictions.food_id = p_food_id;

  insert into public.baby_food_reaction_events (
    baby_id,
    food_id,
    event_type,
    restriction_before,
    restriction_after,
    actor_user_id,
    idempotency_key,
    occurred_at
  ) values (
    active_baby_id,
    p_food_id,
    'resolved',
    'reaction_reported',
    'no_known_restriction',
    caller_id,
    p_idempotency_key,
    occurred
  )
  returning id into inserted_event_id;

  return jsonb_build_object(
    'status', 'resolved',
    'event_id', inserted_event_id,
    'food_id', p_food_id,
    'restriction_status', 'no_known_restriction',
    'resolved_at', occurred,
    'idempotent_retry', false
  );
end;
$$;

revoke all on function public.resolve_food_reaction(text, uuid)
  from public, anon;
grant execute on function public.resolve_food_reaction(text, uuid)
  to authenticated;

create or replace function public.get_active_reaction_blocks()
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
    'baby_id', active_baby_id,
    'items', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'food_id', foods.id,
            'food_name', foods.name
          )
          order by foods.name, foods.id
        ),
        '[]'::jsonb
      )
      from public.baby_food_restrictions
      join public.foods
        on foods.id = baby_food_restrictions.food_id
      where baby_food_restrictions.baby_id = active_baby_id
        and baby_food_restrictions.status = 'reaction_reported'
    )
  );
end;
$$;

revoke all on function public.get_active_reaction_blocks()
  from public, anon;
grant execute on function public.get_active_reaction_blocks()
  to authenticated;

create or replace function public.get_planning_preparation_inputs()
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
    'baby_id', active_baby_id,
    'items', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'preparation_id', published.preparation_id,
            'revision_id', published.revision_id,
            'preparation_slug', published.preparation_slug,
            'food_id', published.food_id
          )
          order by published.preparation_slug, published.revision_id
        ),
        '[]'::jsonb
      )
      from public.current_published_preparations() as published
      where (
        public.get_preparation_eligibility(
          published.preparation_slug
        )->>'status'
      ) = 'eligible'
    )
  );
end;
$$;

revoke all on function public.get_planning_preparation_inputs()
  from public, anon;
grant execute on function public.get_planning_preparation_inputs()
  to authenticated;

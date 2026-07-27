create table public.households (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table public.user_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index user_profiles_household_id_idx
  on public.user_profiles (household_id);

create table public.babies (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  nickname text,
  birth_date date not null,
  time_zone text not null,
  feeding_style text not null
    check (feeding_style in ('finger_foods', 'spoon_fed', 'mixed')),
  meal_slots text[] not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (nickname is null or char_length(nickname) between 1 and 80),
  check (birth_date <= current_date),
  check (cardinality(meal_slots) between 1 and 3),
  check (meal_slots <@ array['breakfast', 'lunch', 'dinner']::text[])
);

create unique index babies_one_active_per_household_idx
  on public.babies (household_id)
  where is_active;

alter table public.households enable row level security;
alter table public.user_profiles enable row level security;
alter table public.babies enable row level security;

create policy "Caregivers can read their household"
  on public.households
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.user_profiles
      where user_profiles.household_id = households.id
        and user_profiles.user_id = (select auth.uid())
    )
  );

create policy "Caregivers can read their own user profile"
  on public.user_profiles
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Caregivers can read babies in their household"
  on public.babies
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.user_profiles
      where user_profiles.household_id = babies.household_id
        and user_profiles.user_id = (select auth.uid())
    )
  );

revoke all on table public.households from public, anon, authenticated;
revoke all on table public.user_profiles from public, anon, authenticated;
revoke all on table public.babies from public, anon, authenticated;

grant select on table public.households to authenticated;
grant select on table public.user_profiles to authenticated;
grant select on table public.babies to authenticated;

create or replace function public.bootstrap_account()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  caller_household_id uuid;
begin
  if caller_id is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(caller_id::text, 0)
  );

  select user_profiles.household_id
    into caller_household_id
  from public.user_profiles
  where user_profiles.user_id = caller_id;

  if caller_household_id is not null then
    return caller_household_id;
  end if;

  insert into public.households default values
    returning households.id into caller_household_id;

  insert into public.user_profiles (user_id, household_id)
  values (caller_id, caller_household_id);

  return caller_household_id;
end;
$$;

create or replace function public.complete_baby_profile(
  p_nickname text,
  p_birth_date date,
  p_time_zone text,
  p_feeding_style text,
  p_meal_slots text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  caller_household_id uuid;
  active_baby_id uuid;
  normalized_nickname text := nullif(pg_catalog.btrim(p_nickname), '');
begin
  if caller_id is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  if p_birth_date is null or p_birth_date > current_date then
    raise exception 'Birth date must be today or earlier'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_timezone_names
    where pg_timezone_names.name = p_time_zone
  ) then
    raise exception 'Time zone must be a valid IANA time zone'
      using errcode = '22023';
  end if;

  if p_feeding_style is null
    or p_feeding_style not in ('finger_foods', 'spoon_fed', 'mixed') then
    raise exception 'Feeding style is invalid'
      using errcode = '22023';
  end if;

  if p_meal_slots is null
    or cardinality(p_meal_slots) not between 1 and 3
    or not p_meal_slots <@ array['breakfast', 'lunch', 'dinner']::text[]
    or (
      select count(distinct meal_slot)
      from pg_catalog.unnest(p_meal_slots) as meal_slot
    ) <> cardinality(p_meal_slots) then
    raise exception 'Choose one to three distinct meal slots'
      using errcode = '22023';
  end if;

  if normalized_nickname is not null
    and char_length(normalized_nickname) > 80 then
    raise exception 'Nickname must be 80 characters or fewer'
      using errcode = '22023';
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
    raise exception 'Account setup is incomplete'
      using errcode = '55000';
  end if;

  select babies.id
    into active_baby_id
  from public.babies
  where babies.household_id = caller_household_id
    and babies.is_active
  for update;

  if active_baby_id is null then
    insert into public.babies (
      household_id,
      nickname,
      birth_date,
      time_zone,
      feeding_style,
      meal_slots
    )
    values (
      caller_household_id,
      normalized_nickname,
      p_birth_date,
      p_time_zone,
      p_feeding_style,
      p_meal_slots
    )
    returning babies.id into active_baby_id;
  else
    update public.babies
    set nickname = normalized_nickname,
        birth_date = p_birth_date,
        time_zone = p_time_zone,
        feeding_style = p_feeding_style,
        meal_slots = p_meal_slots,
        updated_at = now()
    where babies.id = active_baby_id;
  end if;

  return active_baby_id;
end;
$$;

revoke all on function public.bootstrap_account() from public, anon;
revoke all on function public.complete_baby_profile(
  text,
  date,
  text,
  text,
  text[]
) from public, anon;

grant execute on function public.bootstrap_account() to authenticated;
grant execute on function public.complete_baby_profile(
  text,
  date,
  text,
  text,
  text[]
) to authenticated;

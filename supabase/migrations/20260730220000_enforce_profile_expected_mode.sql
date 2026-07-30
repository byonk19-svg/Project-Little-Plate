drop function public.complete_baby_profile(text, date, text, text, text[]);

create function public.complete_baby_profile(
  p_nickname text,
  p_birth_date date,
  p_time_zone text,
  p_feeding_style text,
  p_meal_slots text[],
  p_expected_mode text default null
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

  if p_expected_mode is not null
    and p_expected_mode not in ('create', 'edit') then
    raise exception 'Profile mode is invalid'
      using errcode = '22023';
  end if;

  if p_expected_mode = 'create' and active_baby_id is not null then
    if exists (
      select 1
      from public.babies
      where babies.id = active_baby_id
        and babies.nickname is not distinct from normalized_nickname
        and babies.birth_date = p_birth_date
        and babies.time_zone = p_time_zone
        and babies.feeding_style = p_feeding_style
        and babies.meal_slots = p_meal_slots
    ) then
      return active_baby_id;
    end if;

    raise exception 'Create mode cannot replace an existing baby profile'
      using errcode = '55000';
  end if;

  if p_expected_mode = 'edit' and active_baby_id is null then
    raise exception 'An active baby is required for edit mode'
      using errcode = '55000';
  end if;

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

revoke all on function public.complete_baby_profile(
  text,
  date,
  text,
  text,
  text[],
  text
) from public, anon;

grant execute on function public.complete_baby_profile(
  text,
  date,
  text,
  text,
  text[],
  text
) to authenticated;

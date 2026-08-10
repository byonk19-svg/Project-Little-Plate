create or replace function public.personal_recipe_url_is_public(p_url text)
returns boolean
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  host text;
begin
  if p_url is null or p_url !~ '^https://[A-Za-z0-9.-]+(?:/|\?|#|$)' then
    return false;
  end if;
  host := substring(p_url from '^https://([A-Za-z0-9.-]+)');
  if host is null or host !~ '^[A-Za-z0-9.-]+$' then
    return false;
  end if;
  if host ~* '(^|\.)localhost$' or host ~* '(^|\.)local$' then
    return false;
  end if;
  if host ~ '^0\.' or host ~ '^10\.' or host ~ '^127\.'
    or host ~ '^169\.254\.' or host ~ '^192\.168\.'
    or host ~ '^172\.(1[6-9]|2[0-9]|3[0-1])\.' then
    return false;
  end if;
  return true;
end;
$$;

create table public.personal_recipes (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null,
  household_id uuid not null references public.households (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 160),
  ingredients text not null check (char_length(trim(ingredients)) between 1 and 20000),
  instructions text not null check (char_length(trim(instructions)) between 1 and 30000),
  notes text not null default '' check (char_length(notes) <= 10000),
  source_url text,
  source_type text not null check (source_type in ('manual', 'recipe_url')),
  extraction_method text not null check (
    extraction_method in ('json_ld', 'itemprop', 'metadata_preview', 'manual')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (source_type = 'manual' and source_url is null)
    or (source_type = 'recipe_url' and public.personal_recipe_url_is_public(source_url))
  )
);

create unique index personal_recipes_household_idempotency_key_idx
  on public.personal_recipes (household_id, idempotency_key);

create index personal_recipes_household_id_idx
  on public.personal_recipes (household_id, updated_at desc);

create table public.personal_planning_items (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null,
  household_id uuid not null references public.households (id) on delete cascade,
  baby_id uuid not null references public.babies (id) on delete cascade,
  recipe_id uuid not null references public.personal_recipes (id) on delete cascade,
  local_date date not null,
  meal_slot text not null check (meal_slot in ('breakfast', 'lunch', 'dinner')),
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (baby_id, local_date, meal_slot, recipe_id),
  unique (household_id, idempotency_key)
);

create index personal_planning_items_baby_date_idx
  on public.personal_planning_items (baby_id, local_date, meal_slot);

alter table public.personal_recipes enable row level security;
alter table public.personal_planning_items enable row level security;

create policy "Caregivers can read household personal recipes"
  on public.personal_recipes
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.user_profiles
      where user_profiles.household_id = personal_recipes.household_id
        and user_profiles.user_id = (select auth.uid())
    )
  );

create policy "Caregivers can read household personal planning items"
  on public.personal_planning_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.user_profiles
      where user_profiles.household_id = personal_planning_items.household_id
        and user_profiles.user_id = (select auth.uid())
    )
  );

revoke all on table public.personal_recipes from public, anon, authenticated;
revoke all on table public.personal_planning_items from public, anon, authenticated;
grant select on table public.personal_recipes to authenticated;
grant select on table public.personal_planning_items to authenticated;
grant select, insert, update, delete on table public.personal_recipes to service_role;
grant select, insert, update, delete on table public.personal_planning_items to service_role;

create or replace function public.personal_recipe_household_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select user_profiles.household_id
  from public.user_profiles
  where user_profiles.user_id = (select auth.uid())
$$;

revoke all on function public.personal_recipe_household_id() from public, anon;
grant execute on function public.personal_recipe_household_id() to authenticated;

create or replace function public.list_personal_recipes()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(personal_recipes) order by personal_recipes.updated_at desc), '[]'::jsonb)
  from public.personal_recipes
  where personal_recipes.household_id = public.personal_recipe_household_id()
$$;

create or replace function public.get_personal_recipe(p_recipe_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(personal_recipes)
  from public.personal_recipes
  where personal_recipes.id = p_recipe_id
    and personal_recipes.household_id = public.personal_recipe_household_id()
$$;

create or replace function public.create_personal_recipe(
  p_idempotency_key uuid,
  p_title text,
  p_ingredients text,
  p_instructions text,
  p_notes text,
  p_source_url text,
  p_source_type text,
  p_extraction_method text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  caller_household_id uuid := public.personal_recipe_household_id();
  inserted public.personal_recipes%rowtype;
  existing public.personal_recipes%rowtype;
  normalized_source_url text := nullif(trim(p_source_url), '');
begin
  if caller_id is null or caller_household_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  if p_source_type not in ('manual', 'recipe_url') then
    raise exception 'Invalid personal recipe source type' using errcode = '22023';
  end if;
  if p_idempotency_key is null then
    raise exception 'An idempotency key is required' using errcode = '22023';
  end if;
  if p_source_type = 'manual' and normalized_source_url is not null then
    raise exception 'Manual recipes cannot include a source URL' using errcode = '22023';
  end if;
  if p_source_type = 'recipe_url' and not public.personal_recipe_url_is_public(normalized_source_url) then
    raise exception 'Recipe URL sources must use a public HTTPS URL without credentials or ports' using errcode = '22023';
  end if;

  insert into public.personal_recipes (
    idempotency_key, household_id, created_by, title, ingredients, instructions, notes,
    source_url, source_type, extraction_method
  ) values (
    p_idempotency_key, caller_household_id, caller_id, trim(p_title), trim(p_ingredients),
    trim(p_instructions), coalesce(trim(p_notes), ''), normalized_source_url,
    p_source_type, p_extraction_method
  ) on conflict (household_id, idempotency_key) do nothing
    returning * into inserted;

  if inserted.id is null then
    select * into existing
    from public.personal_recipes
    where household_id = caller_household_id
      and idempotency_key = p_idempotency_key;
    if existing.title is distinct from trim(p_title)
      or existing.ingredients is distinct from trim(p_ingredients)
      or existing.instructions is distinct from trim(p_instructions)
      or existing.notes is distinct from coalesce(trim(p_notes), '')
      or existing.source_url is distinct from normalized_source_url
      or existing.source_type is distinct from p_source_type
      or existing.extraction_method is distinct from p_extraction_method then
      raise exception 'Idempotency key was already used for another recipe' using errcode = '22023';
    end if;
    return to_jsonb(existing);
  end if;

  return to_jsonb(inserted);
end;
$$;

create or replace function public.update_personal_recipe(
  p_recipe_id uuid,
  p_title text,
  p_ingredients text,
  p_instructions text,
  p_notes text,
  p_source_url text,
  p_source_type text,
  p_extraction_method text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated public.personal_recipes%rowtype;
  normalized_source_url text := nullif(trim(p_source_url), '');
begin
  if public.personal_recipe_household_id() is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  if p_source_type not in ('manual', 'recipe_url') then
    raise exception 'Invalid personal recipe source type' using errcode = '22023';
  end if;
  if p_source_type = 'manual' and normalized_source_url is not null then
    raise exception 'Manual recipes cannot include a source URL' using errcode = '22023';
  end if;
  if p_source_type = 'recipe_url' and not public.personal_recipe_url_is_public(normalized_source_url) then
    raise exception 'Recipe URL sources must use a public HTTPS URL without credentials or ports' using errcode = '22023';
  end if;

  update public.personal_recipes
  set title = trim(p_title),
      ingredients = trim(p_ingredients),
      instructions = trim(p_instructions),
      notes = coalesce(trim(p_notes), ''),
      source_url = normalized_source_url,
      source_type = p_source_type,
      extraction_method = p_extraction_method,
      updated_at = now()
  where id = p_recipe_id
    and household_id = public.personal_recipe_household_id()
  returning * into updated;

  if updated.id is null then
    raise exception 'Personal recipe not found' using errcode = 'P0002';
  end if;
  return to_jsonb(updated);
end;
$$;

create or replace function public.delete_personal_recipe(p_recipe_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  delete from public.personal_recipes
  where id = p_recipe_id
    and household_id = public.personal_recipe_household_id();
  get diagnostics deleted_count = row_count;
  return deleted_count = 1;
end;
$$;

create or replace function public.list_personal_planning_items(
  p_window_start date,
  p_baby_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', personal_planning_items.id,
    'recipe_id', personal_planning_items.recipe_id,
    'baby_id', personal_planning_items.baby_id,
    'local_date', personal_planning_items.local_date,
    'meal_slot', personal_planning_items.meal_slot,
    'title', personal_recipes.title,
    'ingredients', personal_recipes.ingredients,
    'instructions', personal_recipes.instructions,
    'source_url', personal_recipes.source_url,
    'label', 'Personal recipe — not reviewed'
  ) order by personal_planning_items.local_date, personal_planning_items.meal_slot, personal_recipes.title), '[]'::jsonb)
  from public.personal_planning_items
  join public.personal_recipes on personal_recipes.id = personal_planning_items.recipe_id
  where personal_planning_items.household_id = public.personal_recipe_household_id()
    and personal_planning_items.baby_id = p_baby_id
    and exists (
      select 1
      from public.babies
      where babies.id = personal_planning_items.baby_id
        and babies.household_id = public.personal_recipe_household_id()
        and babies.is_active
    )
    and personal_planning_items.local_date >= coalesce(p_window_start, current_date)
    and personal_planning_items.local_date < coalesce(p_window_start, current_date) + 7
$$;

create or replace function public.plan_personal_recipe(
  p_idempotency_key uuid,
  p_baby_id uuid,
  p_recipe_id uuid,
  p_local_date date,
  p_meal_slot text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  caller_household_id uuid := public.personal_recipe_household_id();
  baby public.babies%rowtype;
  inserted public.personal_planning_items%rowtype;
  existing public.personal_planning_items%rowtype;
begin
  if caller_id is null or caller_household_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  if p_idempotency_key is null then
    raise exception 'An idempotency key is required' using errcode = '22023';
  end if;

  select * into baby
  from public.babies
  where babies.id = p_baby_id
    and babies.household_id = caller_household_id
    and babies.is_active;
  if baby.id is null then
    raise exception 'Baby profile is unavailable' using errcode = 'P0002';
  end if;
  if p_meal_slot <> all (baby.meal_slots) then
    raise exception 'Meal slot is not configured' using errcode = '22023';
  end if;
  if p_local_date < ((statement_timestamp() at time zone baby.time_zone)::date)
    or p_local_date >= ((statement_timestamp() at time zone baby.time_zone)::date + 7) then
    raise exception 'Choose a day in the current week' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.personal_recipes
    where id = p_recipe_id and household_id = caller_household_id
  ) then
    raise exception 'Personal recipe is unavailable' using errcode = 'P0002';
  end if;

  select * into existing
  from public.personal_planning_items
  where household_id = caller_household_id
    and idempotency_key = p_idempotency_key;
  if existing.id is not null then
    if existing.baby_id <> p_baby_id or existing.recipe_id <> p_recipe_id
      or existing.local_date <> p_local_date or existing.meal_slot <> p_meal_slot then
      raise exception 'Idempotency key was already used for another planning request' using errcode = '22023';
    end if;
    inserted := existing;
  else
    insert into public.personal_planning_items (
      idempotency_key, household_id, baby_id, recipe_id, local_date, meal_slot, created_by
    ) values (
      p_idempotency_key, caller_household_id, p_baby_id, p_recipe_id, p_local_date, p_meal_slot, caller_id
    )
    on conflict do nothing
    returning * into inserted;
  end if;

  if inserted.id is null then
    select * into existing
    from public.personal_planning_items
    where household_id = caller_household_id
      and idempotency_key = p_idempotency_key;
    if existing.id is not null then
      if existing.baby_id <> p_baby_id or existing.recipe_id <> p_recipe_id
        or existing.local_date <> p_local_date or existing.meal_slot <> p_meal_slot then
        raise exception 'Idempotency key was already used for another planning request' using errcode = '22023';
      end if;
      inserted := existing;
    else
      select * into inserted
      from public.personal_planning_items
      where baby_id = p_baby_id
        and recipe_id = p_recipe_id
        and local_date = p_local_date
        and meal_slot = p_meal_slot;
    end if;
  end if;

  return jsonb_build_object(
    'status', 'planned',
    'id', inserted.id,
    'idempotency_key', inserted.idempotency_key,
    'recipe_id', inserted.recipe_id,
    'local_date', inserted.local_date,
    'meal_slot', inserted.meal_slot
  );
end;
$$;

revoke all on function public.list_personal_recipes() from public, anon;
revoke all on function public.get_personal_recipe(uuid) from public, anon;
revoke all on function public.personal_recipe_url_is_public(text) from public, anon, authenticated;
revoke all on function public.create_personal_recipe(uuid, text, text, text, text, text, text, text) from public, anon;
revoke all on function public.update_personal_recipe(uuid, text, text, text, text, text, text, text) from public, anon;
revoke all on function public.delete_personal_recipe(uuid) from public, anon;
revoke all on function public.list_personal_planning_items(date, uuid) from public, anon;
revoke all on function public.plan_personal_recipe(uuid, uuid, uuid, date, text) from public, anon;
grant execute on function public.list_personal_recipes() to authenticated;
grant execute on function public.get_personal_recipe(uuid) to authenticated;
grant execute on function public.create_personal_recipe(uuid, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.update_personal_recipe(uuid, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.delete_personal_recipe(uuid) to authenticated;
grant execute on function public.list_personal_planning_items(date, uuid) to authenticated;
grant execute on function public.plan_personal_recipe(uuid, uuid, uuid, date, text) to authenticated;

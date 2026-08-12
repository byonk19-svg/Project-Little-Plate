create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  description text,
  ingredients text not null check (char_length(btrim(ingredients)) between 1 and 12000),
  instructions text not null check (char_length(btrim(instructions)) between 1 and 20000),
  prep_minutes integer check (prep_minutes is null or prep_minutes between 0 and 1440),
  cook_minutes integer check (cook_minutes is null or cook_minutes between 0 and 1440),
  servings integer check (servings is null or servings between 1 and 100),
  notes text,
  source_url text check (source_url is null or source_url ~* '^https?://'),
  source_title text,
  source_type text not null default 'manual'
    check (source_type in ('manual', 'imported')),
  import_status text not null default 'confirmed'
    check (import_status in ('draft', 'confirmed')),
  tags text[] not null default '{}'::text[],
  is_favorite boolean not null default false,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  check (cardinality(tags) <= 12)
);

create index recipes_household_updated_idx
  on public.recipes (household_id, updated_at desc);
create index recipes_household_favorite_idx
  on public.recipes (household_id, is_favorite, updated_at desc);

alter table public.recipes
  add constraint recipes_household_id_id_key unique (household_id, id);

create table public.recipe_week_slots (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  local_date date not null,
  meal_slot text not null
    check (meal_slot in ('breakfast', 'lunch', 'dinner')),
  status text not null default 'planned'
    check (status in ('planned', 'skipped', 'completed')),
  note text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique (household_id, local_date, meal_slot)
);

create index recipe_week_slots_household_date_idx
  on public.recipe_week_slots (household_id, local_date, meal_slot);

alter table public.recipe_week_slots
  add constraint recipe_week_slots_recipe_household_fk
  foreign key (household_id, recipe_id)
  references public.recipes (household_id, id)
  on delete cascade;

create table public.prepared_notes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  week_slot_id uuid references public.recipe_week_slots (id) on delete set null,
  status text not null default 'prepared'
    check (status in ('preparing', 'prepared', 'used', 'archived')),
  portion_count integer check (portion_count is null or portion_count between 0 and 1000),
  notes text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);

create index prepared_notes_household_updated_idx
  on public.prepared_notes (household_id, updated_at desc);

alter table public.prepared_notes
  add constraint prepared_notes_recipe_household_fk
  foreign key (household_id, recipe_id)
  references public.recipes (household_id, id)
  on delete cascade;

create or replace function public.validate_recipe_tags()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from pg_catalog.unnest(new.tags) as tag
    where pg_catalog.char_length(pg_catalog.btrim(tag)) not between 1 and 40
  ) then
    raise exception 'Recipe tags must contain one to forty characters'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

create or replace function public.set_recipe_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = statement_timestamp();
  return new;
end;
$$;

create trigger recipes_set_updated_at
before update on public.recipes
for each row execute function public.set_recipe_updated_at();

create trigger recipes_validate_tags
before insert or update on public.recipes
for each row execute function public.validate_recipe_tags();

create or replace function public.validate_recipe_household_links()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.recipes
    where recipes.id = new.recipe_id
      and recipes.household_id = new.household_id
  ) then
    raise exception 'Recipe does not belong to this household'
      using errcode = '42501';
  end if;

  if tg_table_name = 'prepared_notes'
    and (pg_catalog.to_jsonb(new)->>'week_slot_id') is not null
    and not exists (
      select 1
      from public.recipe_week_slots
      where recipe_week_slots.id =
          ((pg_catalog.to_jsonb(new)->>'week_slot_id')::uuid)
        and recipe_week_slots.household_id =
          ((pg_catalog.to_jsonb(new)->>'household_id')::uuid)
        and recipe_week_slots.recipe_id =
          ((pg_catalog.to_jsonb(new)->>'recipe_id')::uuid)
    ) then
    raise exception 'Prepared note link does not belong to this household'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger recipe_week_slots_validate_links
before insert or update on public.recipe_week_slots
for each row execute function public.validate_recipe_household_links();

create trigger prepared_notes_validate_links
before insert or update on public.prepared_notes
for each row execute function public.validate_recipe_household_links();

create trigger recipe_week_slots_set_updated_at
before update on public.recipe_week_slots
for each row execute function public.set_recipe_updated_at();

create trigger prepared_notes_set_updated_at
before update on public.prepared_notes
for each row execute function public.set_recipe_updated_at();

alter table public.recipes enable row level security;
alter table public.recipe_week_slots enable row level security;
alter table public.prepared_notes enable row level security;

create policy "Caregivers can read household recipes"
  on public.recipes for select to authenticated
  using (exists (
    select 1 from public.user_profiles
    where user_profiles.household_id = recipes.household_id
      and user_profiles.user_id = (select auth.uid())
  ));

create policy "Caregivers can create household recipes"
  on public.recipes for insert to authenticated
  with check (exists (
    select 1 from public.user_profiles
    where user_profiles.household_id = recipes.household_id
      and user_profiles.user_id = (select auth.uid())
  ));

create policy "Caregivers can update household recipes"
  on public.recipes for update to authenticated
  using (exists (
    select 1 from public.user_profiles
    where user_profiles.household_id = recipes.household_id
      and user_profiles.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.user_profiles
    where user_profiles.household_id = recipes.household_id
      and user_profiles.user_id = (select auth.uid())
  ));

create policy "Caregivers can delete household recipes"
  on public.recipes for delete to authenticated
  using (exists (
    select 1 from public.user_profiles
    where user_profiles.household_id = recipes.household_id
      and user_profiles.user_id = (select auth.uid())
  ));

create policy "Caregivers can read household week slots"
  on public.recipe_week_slots for select to authenticated
  using (exists (
    select 1 from public.user_profiles
    where user_profiles.household_id = recipe_week_slots.household_id
      and user_profiles.user_id = (select auth.uid())
  ));

create policy "Caregivers can create household week slots"
  on public.recipe_week_slots for insert to authenticated
  with check (exists (
    select 1 from public.user_profiles
    where user_profiles.household_id = recipe_week_slots.household_id
      and user_profiles.user_id = (select auth.uid())
  ));

create policy "Caregivers can update household week slots"
  on public.recipe_week_slots for update to authenticated
  using (exists (
    select 1 from public.user_profiles
    where user_profiles.household_id = recipe_week_slots.household_id
      and user_profiles.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.user_profiles
    where user_profiles.household_id = recipe_week_slots.household_id
      and user_profiles.user_id = (select auth.uid())
  ));

create policy "Caregivers can delete household week slots"
  on public.recipe_week_slots for delete to authenticated
  using (exists (
    select 1 from public.user_profiles
    where user_profiles.household_id = recipe_week_slots.household_id
      and user_profiles.user_id = (select auth.uid())
  ));

create policy "Caregivers can read household prepared notes"
  on public.prepared_notes for select to authenticated
  using (exists (
    select 1 from public.user_profiles
    where user_profiles.household_id = prepared_notes.household_id
      and user_profiles.user_id = (select auth.uid())
  ));

create policy "Caregivers can create household prepared notes"
  on public.prepared_notes for insert to authenticated
  with check (exists (
    select 1 from public.user_profiles
    where user_profiles.household_id = prepared_notes.household_id
      and user_profiles.user_id = (select auth.uid())
  ));

create policy "Caregivers can update household prepared notes"
  on public.prepared_notes for update to authenticated
  using (exists (
    select 1 from public.user_profiles
    where user_profiles.household_id = prepared_notes.household_id
      and user_profiles.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.user_profiles
    where user_profiles.household_id = prepared_notes.household_id
      and user_profiles.user_id = (select auth.uid())
  ));

create policy "Caregivers can delete household prepared notes"
  on public.prepared_notes for delete to authenticated
  using (exists (
    select 1 from public.user_profiles
    where user_profiles.household_id = prepared_notes.household_id
      and user_profiles.user_id = (select auth.uid())
  ));

revoke all on table public.recipes from public, anon;
revoke all on table public.recipe_week_slots from public, anon;
revoke all on table public.prepared_notes from public, anon;
grant select, insert, update, delete on table public.recipes to authenticated;
grant select, insert, update, delete on table public.recipe_week_slots to authenticated;
grant select, insert, update, delete on table public.prepared_notes to authenticated;

revoke all on function public.set_recipe_updated_at() from public, anon, authenticated;
revoke all on function public.validate_recipe_tags() from public, anon, authenticated;
revoke all on function public.validate_recipe_household_links() from public, anon, authenticated;

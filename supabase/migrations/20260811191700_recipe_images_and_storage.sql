insert into storage.buckets (id, name, public)
values ('recipe-images', 'recipe-images', false)
on conflict (id) do update set public = false;

create table public.recipe_images (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  source_type text not null
    check (source_type in ('upload', 'external', 'import_suggestion')),
  storage_path text,
  external_url text,
  alt_text text not null check (char_length(btrim(alt_text)) between 1 and 240),
  source_url text,
  rights_note text,
  mime_type text,
  width integer check (width is null or width between 1 and 10000),
  height integer check (height is null or height between 1 and 10000),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  check (
    (source_type = 'upload' and storage_path is not null and external_url is null)
    or (source_type in ('external', 'import_suggestion') and external_url is not null and storage_path is null)
  ),
  check (source_url is null or source_url ~* '^https?://'),
  check (external_url is null or external_url ~* '^https?://')
);

create unique index recipe_images_one_cover_per_recipe_idx
  on public.recipe_images (recipe_id);
create index recipe_images_household_idx
  on public.recipe_images (household_id, updated_at desc);

alter table public.recipe_images
  add constraint recipe_images_recipe_household_fk
  foreign key (household_id, recipe_id)
  references public.recipes (household_id, id)
  on delete cascade;

create or replace function public.delete_recipe_image_object()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.storage_path is not null then
    delete from storage.objects
    where bucket_id = 'recipe-images'
      and name = old.storage_path;
  end if;
  return old;
end;
$$;

create trigger recipe_images_delete_object
before delete on public.recipe_images
for each row execute function public.delete_recipe_image_object();

alter table public.recipe_images enable row level security;

create policy "Caregivers can read household recipe images"
  on public.recipe_images for select to authenticated
  using (exists (
    select 1 from public.user_profiles
    where user_profiles.household_id = recipe_images.household_id
      and user_profiles.user_id = (select auth.uid())
  ));

create policy "Caregivers can create household recipe images"
  on public.recipe_images for insert to authenticated
  with check (exists (
    select 1 from public.user_profiles
    where user_profiles.household_id = recipe_images.household_id
      and user_profiles.user_id = (select auth.uid())
  ));

create policy "Caregivers can update household recipe images"
  on public.recipe_images for update to authenticated
  using (exists (
    select 1 from public.user_profiles
    where user_profiles.household_id = recipe_images.household_id
      and user_profiles.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.user_profiles
    where user_profiles.household_id = recipe_images.household_id
      and user_profiles.user_id = (select auth.uid())
  ));

create policy "Caregivers can delete household recipe images"
  on public.recipe_images for delete to authenticated
  using (exists (
    select 1 from public.user_profiles
    where user_profiles.household_id = recipe_images.household_id
      and user_profiles.user_id = (select auth.uid())
  ));

create policy "Caregivers can read private recipe image objects"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'recipe-images'
    and exists (
      select 1
      from public.user_profiles
      where user_profiles.household_id::text = (storage.foldername(name))[1]
        and user_profiles.user_id = (select auth.uid())
    )
  );

create policy "Caregivers can upload private recipe image objects"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'recipe-images'
    and array_length(storage.foldername(name), 1) >= 3
    and exists (
      select 1
      from public.user_profiles
      where user_profiles.household_id::text = (storage.foldername(name))[1]
        and user_profiles.user_id = (select auth.uid())
    )
  );

create policy "Caregivers can update private recipe image objects"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'recipe-images'
    and exists (
      select 1
      from public.user_profiles
      where user_profiles.household_id::text = (storage.foldername(name))[1]
        and user_profiles.user_id = (select auth.uid())
    )
  )
  with check (
    bucket_id = 'recipe-images'
    and exists (
      select 1
      from public.user_profiles
      where user_profiles.household_id::text = (storage.foldername(name))[1]
        and user_profiles.user_id = (select auth.uid())
    )
  );

create policy "Caregivers can delete private recipe image objects"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'recipe-images'
    and exists (
      select 1
      from public.user_profiles
      where user_profiles.household_id::text = (storage.foldername(name))[1]
        and user_profiles.user_id = (select auth.uid())
    )
  );

revoke all on table public.recipe_images from public, anon;
grant select, insert, update, delete on table public.recipe_images to authenticated;
revoke all on function public.delete_recipe_image_object() from public, anon, authenticated;

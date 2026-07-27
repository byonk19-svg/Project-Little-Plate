create table public.sources (
  id text primary key,
  publisher text not null check (btrim(publisher) <> ''),
  title text not null check (btrim(title) <> ''),
  url text not null check (url ~ '^https://'),
  source_date date not null,
  accessed_at date not null
);

create table public.tags (
  id text primary key,
  kind text not null check (kind in ('skill', 'allergen', 'category')),
  label text not null check (btrim(label) <> '')
);

create table public.foods (
  id text primary key,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (btrim(name) <> ''),
  category text not null check (btrim(category) <> '')
);

create table public.preparations (
  id text primary key,
  food_id text not null references public.foods (id),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (btrim(name) <> ''),
  is_active boolean not null default false
);

create table public.content_revisions (
  id text primary key,
  preparation_id text not null references public.preparations (id),
  version integer not null check (version > 0),
  status text not null check (status in ('draft', 'in_review', 'approved')),
  method text not null check (btrim(method) <> ''),
  shape_texture text not null check (btrim(shape_texture) <> ''),
  source_id text not null references public.sources (id),
  reviewer_role text,
  reviewed_at date,
  approved_at date,
  next_review_at date,
  created_at timestamptz not null default now(),
  unique (preparation_id, version),
  check (
    status <> 'in_review'
    or (reviewer_role is not null and reviewed_at is not null)
  ),
  check (
    status <> 'approved'
    or (
      reviewer_role is not null
      and reviewed_at is not null
      and approved_at is not null
      and next_review_at is not null
      and next_review_at >= approved_at
    )
  )
);

create table public.revision_tags (
  revision_id text not null references public.content_revisions (id),
  tag_id text not null references public.tags (id),
  primary key (revision_id, tag_id)
);

create table public.storage_rules (
  id text primary key,
  revision_id text not null references public.content_revisions (id),
  support_status text not null
    check (support_status in ('supported', 'unsupported')),
  deadline_kind text
    check (
      deadline_kind is null
      or deadline_kind in ('discard_after', 'quality_by', 'informational')
    ),
  duration_hours integer check (duration_hours is null or duration_hours > 0),
  guidance text,
  check (
    (
      support_status = 'unsupported'
      and deadline_kind is null
      and duration_hours is null
      and guidance is null
    )
    or (
      support_status = 'supported'
      and deadline_kind is not null
      and guidance is not null
      and btrim(guidance) <> ''
      and (
        deadline_kind = 'informational'
        or duration_hours is not null
      )
    )
  )
);

create table public.content_retirements (
  revision_id text primary key references public.content_revisions (id),
  retired_at date not null,
  reason text not null check (btrim(reason) <> '')
);

alter table public.sources enable row level security;
alter table public.tags enable row level security;
alter table public.foods enable row level security;
alter table public.preparations enable row level security;
alter table public.content_revisions enable row level security;
alter table public.revision_tags enable row level security;
alter table public.storage_rules enable row level security;
alter table public.content_retirements enable row level security;

revoke all on table public.sources from public, anon, authenticated;
revoke all on table public.tags from public, anon, authenticated;
revoke all on table public.foods from public, anon, authenticated;
revoke all on table public.preparations from public, anon, authenticated;
revoke all on table public.content_revisions from public, anon, authenticated;
revoke all on table public.revision_tags from public, anon, authenticated;
revoke all on table public.storage_rules from public, anon, authenticated;
revoke all on table public.content_retirements from public, anon, authenticated;

grant select, insert, update, delete on table public.sources to service_role;
grant select, insert, update, delete on table public.tags to service_role;
grant select, insert, update, delete on table public.foods to service_role;
grant select, insert, update, delete on table public.preparations to service_role;
grant select, insert, update, delete
  on table public.content_revisions to service_role;
grant select, insert, update, delete on table public.revision_tags to service_role;
grant select, insert, update, delete on table public.storage_rules to service_role;
grant select, insert, update, delete
  on table public.content_retirements to service_role;

create or replace function public.prevent_approved_revision_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'approved' then
    raise exception 'Approved revisions are append-only'
      using errcode = '55000';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger content_revisions_append_only
before update or delete on public.content_revisions
for each row execute function public.prevent_approved_revision_changes();

create or replace function public.prevent_approved_revision_child_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_revision_id text := case
    when tg_table_name = 'storage_rules'
      then coalesce(new.revision_id, old.revision_id)
    else coalesce(new.revision_id, old.revision_id)
  end;
begin
  if exists (
    select 1
    from public.content_revisions
    where content_revisions.id = target_revision_id
      and content_revisions.status = 'approved'
  ) then
    raise exception 'Approved revision children are append-only'
      using errcode = '55000';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger revision_tags_append_only
before insert or update or delete on public.revision_tags
for each row execute function public.prevent_approved_revision_child_changes();

create trigger storage_rules_append_only
before insert or update or delete on public.storage_rules
for each row execute function public.prevent_approved_revision_child_changes();

create or replace function public.prevent_approved_reference_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  is_approved_reference boolean := false;
begin
  if tg_op = 'UPDATE' and new is not distinct from old then
    return new;
  end if;

  if tg_table_name = 'sources' then
    select exists (
      select 1
      from public.content_revisions
      where content_revisions.source_id = old.id
        and content_revisions.status = 'approved'
    ) into is_approved_reference;
  elsif tg_table_name = 'tags' then
    select exists (
      select 1
      from public.revision_tags
      join public.content_revisions
        on content_revisions.id = revision_tags.revision_id
      where revision_tags.tag_id = old.id
        and content_revisions.status = 'approved'
    ) into is_approved_reference;
  elsif tg_table_name = 'foods' then
    select exists (
      select 1
      from public.preparations
      join public.content_revisions
        on content_revisions.preparation_id = preparations.id
      where preparations.food_id = old.id
        and content_revisions.status = 'approved'
    ) into is_approved_reference;
  elsif tg_table_name = 'preparations' then
    select exists (
      select 1
      from public.content_revisions
      where content_revisions.preparation_id = old.id
        and content_revisions.status = 'approved'
    ) into is_approved_reference;
  end if;

  if is_approved_reference then
    raise exception 'Approved content references are append-only'
      using errcode = '55000';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger approved_sources_append_only
before update or delete on public.sources
for each row execute function public.prevent_approved_reference_changes();

create trigger approved_tags_append_only
before update or delete on public.tags
for each row execute function public.prevent_approved_reference_changes();

create trigger approved_foods_append_only
before update or delete on public.foods
for each row execute function public.prevent_approved_reference_changes();

create trigger approved_preparations_append_only
before update or delete on public.preparations
for each row execute function public.prevent_approved_reference_changes();

create or replace function public.prevent_retirement_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Content retirements are append-only'
    using errcode = '55000';
end;
$$;

create trigger content_retirements_append_only
before update or delete on public.content_retirements
for each row execute function public.prevent_retirement_changes();

create or replace function public.import_catalog_fixture(p_fixture jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_record jsonb;
  tag_record jsonb;
  food_record jsonb;
  preparation_record jsonb;
  revision_record jsonb;
  rule_record jsonb;
  retirement_record jsonb;
  desired_status text;
  existing_status text;
  current_revision_id text;
  existing_tags jsonb;
  incoming_tags jsonb;
  existing_rules jsonb;
  incoming_rules jsonb;
begin
  if p_fixture is null
    or jsonb_typeof(p_fixture->'sources') <> 'array'
    or jsonb_typeof(p_fixture->'tags') <> 'array'
    or jsonb_typeof(p_fixture->'foods') <> 'array'
    or jsonb_typeof(p_fixture->'preparations') <> 'array'
    or jsonb_typeof(p_fixture->'revisions') <> 'array'
    or jsonb_typeof(p_fixture->'retirements') <> 'array' then
    raise exception 'Catalog fixture must contain every required collection'
      using errcode = '22023';
  end if;

  for source_record in
    select value from jsonb_array_elements(p_fixture->'sources')
  loop
    insert into public.sources (
      id,
      publisher,
      title,
      url,
      source_date,
      accessed_at
    )
    values (
      source_record->>'id',
      source_record->>'publisher',
      source_record->>'title',
      source_record->>'url',
      (source_record->>'source_date')::date,
      (source_record->>'accessed_at')::date
    )
    on conflict (id) do nothing;

    if not exists (
      select 1
      from public.sources
      where sources.id = source_record->>'id'
        and sources.publisher = source_record->>'publisher'
        and sources.title = source_record->>'title'
        and sources.url = source_record->>'url'
        and sources.source_date = (source_record->>'source_date')::date
        and sources.accessed_at = (source_record->>'accessed_at')::date
    ) then
      raise exception 'Source identifiers cannot be reused with different data'
        using errcode = '22023';
    end if;
  end loop;

  for tag_record in
    select value from jsonb_array_elements(p_fixture->'tags')
  loop
    insert into public.tags (id, kind, label)
    values (
      tag_record->>'id',
      tag_record->>'kind',
      tag_record->>'label'
    )
    on conflict (id) do nothing;

    if not exists (
      select 1
      from public.tags
      where tags.id = tag_record->>'id'
        and tags.kind = tag_record->>'kind'
        and tags.label = tag_record->>'label'
    ) then
      raise exception 'Tag identifiers cannot be reused with different data'
        using errcode = '22023';
    end if;
  end loop;

  for food_record in
    select value from jsonb_array_elements(p_fixture->'foods')
  loop
    insert into public.foods (id, slug, name, category)
    values (
      food_record->>'id',
      food_record->>'slug',
      food_record->>'name',
      food_record->>'category'
    )
    on conflict (id) do update
      set slug = excluded.slug,
          name = excluded.name,
          category = excluded.category;
  end loop;

  for preparation_record in
    select value from jsonb_array_elements(p_fixture->'preparations')
  loop
    insert into public.preparations (id, food_id, slug, name, is_active)
    values (
      preparation_record->>'id',
      preparation_record->>'food_id',
      preparation_record->>'slug',
      preparation_record->>'name',
      (preparation_record->>'is_active')::boolean
    )
    on conflict (id) do update
      set food_id = excluded.food_id,
          slug = excluded.slug,
          name = excluded.name,
          is_active = excluded.is_active;
  end loop;

  for revision_record in
    select value from jsonb_array_elements(p_fixture->'revisions')
  loop
    current_revision_id := revision_record->>'id';
    desired_status := revision_record->>'status';

    if not exists (
      select 1 from public.sources
      where sources.id = revision_record->>'source_id'
    ) then
      raise exception 'Revision requires a valid source reference'
        using errcode = '22023';
    end if;

    if jsonb_typeof(revision_record->'tag_ids') <> 'array'
      or not exists (
        select 1
        from jsonb_array_elements_text(revision_record->'tag_ids') as tag_id
        join public.tags on tags.id = tag_id
        where tags.kind = 'skill'
      ) then
      raise exception 'Revision requires a valid skill reference'
        using errcode = '22023';
    end if;

    if not exists (
      select 1
      from jsonb_array_elements_text(revision_record->'tag_ids') as tag_id
      join public.tags on tags.id = tag_id
      where tags.kind = 'allergen'
    ) then
      raise exception 'Revision requires a valid allergen reference'
        using errcode = '22023';
    end if;

    if exists (
      select 1
      from jsonb_array_elements_text(revision_record->'tag_ids') as tag_id
      left join public.tags on tags.id = tag_id
      where tags.id is null
    ) then
      raise exception 'Revision contains an unknown tag reference'
        using errcode = '22023';
    end if;

    if jsonb_typeof(revision_record->'storage_rules') <> 'array'
      or jsonb_array_length(revision_record->'storage_rules') = 0 then
      raise exception 'Revision requires an explicit storage rule reference'
        using errcode = '22023';
    end if;

    if desired_status = 'approved'
      and (
        nullif(revision_record->>'reviewer_role', '') is null
        or nullif(revision_record->>'reviewed_at', '') is null
        or nullif(revision_record->>'approved_at', '') is null
        or nullif(revision_record->>'next_review_at', '') is null
      ) then
      raise exception 'Approved revision requires complete review metadata'
        using errcode = '22023';
    end if;

    select content_revisions.status
      into existing_status
    from public.content_revisions
    where content_revisions.id = current_revision_id;

    if existing_status = 'approved' then
      if not exists (
        select 1
        from public.content_revisions
        where content_revisions.id = current_revision_id
          and content_revisions.preparation_id =
            revision_record->>'preparation_id'
          and content_revisions.version =
            (revision_record->>'version')::integer
          and content_revisions.status = desired_status
          and content_revisions.method = revision_record->>'method'
          and content_revisions.shape_texture =
            revision_record->>'shape_texture'
          and content_revisions.source_id = revision_record->>'source_id'
          and content_revisions.reviewer_role is not distinct from
            nullif(revision_record->>'reviewer_role', '')
          and content_revisions.reviewed_at is not distinct from
            nullif(revision_record->>'reviewed_at', '')::date
          and content_revisions.approved_at is not distinct from
            nullif(revision_record->>'approved_at', '')::date
          and content_revisions.next_review_at is not distinct from
            nullif(revision_record->>'next_review_at', '')::date
      ) then
        raise exception 'Approved revision identifiers cannot be reused'
          using errcode = '22023';
      end if;

      select coalesce(jsonb_agg(revision_tags.tag_id order by revision_tags.tag_id), '[]'::jsonb)
        into existing_tags
      from public.revision_tags
      where revision_tags.revision_id = current_revision_id;

      select coalesce(jsonb_agg(tag_id order by tag_id), '[]'::jsonb)
        into incoming_tags
      from jsonb_array_elements_text(revision_record->'tag_ids') as tag_ids(tag_id);

      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', storage_rules.id,
            'support_status', storage_rules.support_status,
            'deadline_kind', storage_rules.deadline_kind,
            'duration_hours', storage_rules.duration_hours,
            'guidance', storage_rules.guidance
          )
          order by storage_rules.id
        ),
        '[]'::jsonb
      )
        into existing_rules
      from public.storage_rules
      where storage_rules.revision_id = current_revision_id;

      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', rule_value->>'id',
            'support_status', rule_value->>'support_status',
            'deadline_kind', nullif(rule_value->>'deadline_kind', ''),
            'duration_hours', nullif(rule_value->>'duration_hours', '')::integer,
            'guidance', nullif(rule_value->>'guidance', '')
          )
          order by rule_value->>'id'
        ),
        '[]'::jsonb
      )
        into incoming_rules
      from jsonb_array_elements(revision_record->'storage_rules')
        as rule_values(rule_value);

      if existing_tags is distinct from incoming_tags
        or existing_rules is distinct from incoming_rules then
        raise exception 'Approved revision identifiers cannot be reused'
          using errcode = '22023';
      end if;

      continue;
    end if;

    insert into public.content_revisions (
      id,
      preparation_id,
      version,
      status,
      method,
      shape_texture,
      source_id,
      reviewer_role,
      reviewed_at,
      approved_at,
      next_review_at
    )
    values (
      current_revision_id,
      revision_record->>'preparation_id',
      (revision_record->>'version')::integer,
      'draft',
      revision_record->>'method',
      revision_record->>'shape_texture',
      revision_record->>'source_id',
      nullif(revision_record->>'reviewer_role', ''),
      nullif(revision_record->>'reviewed_at', '')::date,
      nullif(revision_record->>'approved_at', '')::date,
      nullif(revision_record->>'next_review_at', '')::date
    )
    on conflict (id) do update
      set preparation_id = excluded.preparation_id,
          version = excluded.version,
          status = 'draft',
          method = excluded.method,
          shape_texture = excluded.shape_texture,
          source_id = excluded.source_id,
          reviewer_role = excluded.reviewer_role,
          reviewed_at = excluded.reviewed_at,
          approved_at = excluded.approved_at,
          next_review_at = excluded.next_review_at;

    delete from public.revision_tags
    where revision_tags.revision_id = current_revision_id;

    insert into public.revision_tags (revision_id, tag_id)
    select current_revision_id, value
    from jsonb_array_elements_text(revision_record->'tag_ids');

    delete from public.storage_rules
    where storage_rules.revision_id = current_revision_id;

    for rule_record in
      select value from jsonb_array_elements(revision_record->'storage_rules')
    loop
      insert into public.storage_rules (
        id,
        revision_id,
        support_status,
        deadline_kind,
        duration_hours,
        guidance
      )
      values (
        rule_record->>'id',
        current_revision_id,
        rule_record->>'support_status',
        nullif(rule_record->>'deadline_kind', ''),
        nullif(rule_record->>'duration_hours', '')::integer,
        nullif(rule_record->>'guidance', '')
      );
    end loop;

    update public.content_revisions
    set status = desired_status
    where content_revisions.id = current_revision_id;
  end loop;

  for retirement_record in
    select value from jsonb_array_elements(p_fixture->'retirements')
  loop
    if not exists (
      select 1 from public.content_revisions
      where content_revisions.id = retirement_record->>'revision_id'
        and content_revisions.status = 'approved'
    ) then
      raise exception 'Only an approved revision can be retired'
        using errcode = '22023';
    end if;

    insert into public.content_retirements (revision_id, retired_at, reason)
    values (
      retirement_record->>'revision_id',
      (retirement_record->>'retired_at')::date,
      retirement_record->>'reason'
    )
    on conflict (revision_id) do nothing;
  end loop;

  return jsonb_build_object(
    'sources', (select count(*) from public.sources),
    'foods', (select count(*) from public.foods),
    'preparations', (select count(*) from public.preparations),
    'revisions', (select count(*) from public.content_revisions)
  );
end;
$$;

create or replace function public.list_published_preparations()
returns table (
  slug text,
  food_name text,
  preparation_name text,
  storage_support_status text
)
language sql
stable
security definer
set search_path = ''
as $$
  with published as (
    select distinct on (preparations.id)
      preparations.id,
      preparations.slug,
      preparations.name as preparation_name,
      foods.name as food_name,
      content_revisions.id as revision_id
    from public.preparations
    join public.foods on foods.id = preparations.food_id
    join public.content_revisions
      on content_revisions.preparation_id = preparations.id
    where preparations.is_active
      and content_revisions.status = 'approved'
      and content_revisions.reviewer_role is not null
      and content_revisions.reviewed_at is not null
      and content_revisions.approved_at is not null
      and content_revisions.next_review_at is not null
      and not exists (
        select 1 from public.content_retirements
        where content_retirements.revision_id = content_revisions.id
      )
      and exists (
        select 1
        from public.revision_tags
        join public.tags on tags.id = revision_tags.tag_id
        where revision_tags.revision_id = content_revisions.id
          and tags.kind = 'skill'
      )
      and exists (
        select 1
        from public.revision_tags
        join public.tags on tags.id = revision_tags.tag_id
        where revision_tags.revision_id = content_revisions.id
          and tags.kind = 'allergen'
      )
      and exists (
        select 1 from public.storage_rules
        where storage_rules.revision_id = content_revisions.id
      )
    order by preparations.id, content_revisions.version desc
  )
  select
    published.slug,
    published.food_name,
    published.preparation_name,
    case
      when exists (
        select 1 from public.storage_rules
        where storage_rules.revision_id = published.revision_id
          and storage_rules.support_status = 'supported'
      ) then 'supported'
      else 'unsupported'
    end
  from published
  order by published.food_name, published.preparation_name;
$$;

create or replace function public.get_published_preparation(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with published as (
    select distinct on (preparations.id)
      preparations.slug,
      preparations.name as preparation_name,
      foods.name as food_name,
      foods.category,
      content_revisions.*
    from public.preparations
    join public.foods on foods.id = preparations.food_id
    join public.content_revisions
      on content_revisions.preparation_id = preparations.id
    where preparations.slug = p_slug
      and preparations.is_active
      and content_revisions.status = 'approved'
      and content_revisions.reviewer_role is not null
      and content_revisions.reviewed_at is not null
      and content_revisions.approved_at is not null
      and content_revisions.next_review_at is not null
      and not exists (
        select 1 from public.content_retirements
        where content_retirements.revision_id = content_revisions.id
      )
      and exists (
        select 1
        from public.revision_tags
        join public.tags on tags.id = revision_tags.tag_id
        where revision_tags.revision_id = content_revisions.id
          and tags.kind = 'skill'
      )
      and exists (
        select 1
        from public.revision_tags
        join public.tags on tags.id = revision_tags.tag_id
        where revision_tags.revision_id = content_revisions.id
          and tags.kind = 'allergen'
      )
      and exists (
        select 1 from public.storage_rules
        where storage_rules.revision_id = content_revisions.id
      )
    order by preparations.id, content_revisions.version desc
  )
  select jsonb_build_object(
    'slug', published.slug,
    'food_name', published.food_name,
    'category', published.category,
    'preparation_name', published.preparation_name,
    'revision_id', published.id,
    'version', published.version,
    'method', published.method,
    'shape_texture', published.shape_texture,
    'reviewer_role', published.reviewer_role,
    'reviewed_at', published.reviewed_at,
    'approved_at', published.approved_at,
    'next_review_at', published.next_review_at,
    'source', (
      select jsonb_build_object(
        'publisher', sources.publisher,
        'title', sources.title,
        'url', sources.url,
        'source_date', sources.source_date,
        'accessed_at', sources.accessed_at
      )
      from public.sources
      where sources.id = published.source_id
    ),
    'tags', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'kind', tags.kind,
            'label', tags.label
          )
          order by tags.kind, tags.label
        ),
        '[]'::jsonb
      )
      from public.revision_tags
      join public.tags on tags.id = revision_tags.tag_id
      where revision_tags.revision_id = published.id
    ),
    'storage_rules', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'support_status', storage_rules.support_status,
            'deadline_kind', storage_rules.deadline_kind,
            'duration_hours', storage_rules.duration_hours,
            'guidance', storage_rules.guidance
          )
          order by storage_rules.id
        ),
        '[]'::jsonb
      )
      from public.storage_rules
      where storage_rules.revision_id = published.id
    )
  )
  from published;
$$;

revoke all on function public.import_catalog_fixture(jsonb) from public, anon, authenticated;
grant execute on function public.import_catalog_fixture(jsonb) to service_role;

revoke all on function public.list_published_preparations()
  from public, anon, authenticated;
grant execute on function public.list_published_preparations()
  to anon, authenticated;

revoke all on function public.get_published_preparation(text)
  from public, anon, authenticated;
grant execute on function public.get_published_preparation(text)
  to anon, authenticated;

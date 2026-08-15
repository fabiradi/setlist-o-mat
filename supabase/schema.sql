-- Setlist-o-Mat: initial schema for Supabase Postgres
-- Run this in the Supabase SQL editor, then configure the Before User Created
-- Auth hook to call private.before_user_created.

create extension if not exists citext with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.signup_access (
  id boolean primary key default true check (id),
  code_hash text not null,
  updated_at timestamptz not null default now()
);
revoke all on table private.signup_access from public, anon, authenticated;

create type public.project_role as enum ('member', 'admin');
create type public.member_status as enum ('active', 'suspended');
create type public.solo_status as enum ('unknown', 'none', 'available');
create type public.setlist_state as enum ('draft', 'published', 'finalist', 'final');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email extensions.citext not null unique,
  display_name text not null check (length(trim(display_name)) between 1 and 80),
  name_confirmed_at timestamptz,
  password_change_required boolean not null default false,
  is_app_admin boolean not null default false,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.app_settings (
  id text primary key check (id = 'global'),
  maintenance_mode boolean not null default false,
  maintenance_message text not null default 'Der Setlist-o-Mat wird gerade gestimmt. Gleich geht es weiter!',
  maintenance_started_at timestamptz,
  maintenance_started_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id) values ('global');

create table public.signup_allowed_emails (
  email extensions.citext primary key,
  display_name text,
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.signup_blocked_emails (
  email extensions.citext primary key,
  reason text,
  blocked_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  status text not null default 'active' check (status in ('active', 'archived')),
  target_min_seconds integer not null default 1500 check (target_min_seconds >= 0),
  target_max_seconds integer not null default 1800 check (target_max_seconds > target_min_seconds),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.project_role not null default 'member',
  status public.member_status not null default 'active',
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz,
  primary key (project_id, user_id)
);

create table public.pieces (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  import_key text,
  title text not null check (length(trim(title)) > 0),
  composer text not null default '',
  duration_seconds integer not null check (duration_seconds > 0),
  grade numeric(3,1),
  price_cents integer not null default 0 check (price_cents >= 0),
  owned boolean not null default false,
  genres text[] not null default '{}',
  sample_url text,
  purchase_url text,
  solo_status public.solo_status not null default 'unknown',
  solos text,
  source text not null default '',
  note text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, import_key)
);

create table public.piece_ratings (
  piece_id uuid not null references public.pieces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  stars smallint,
  skipped boolean not null default false,
  comment text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (piece_id, user_id),
  check ((skipped and stars is null) or (not skipped and stars between 1 and 5))
);

create table public.setlists (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  state public.setlist_state not null default 'draft',
  derived_from uuid references public.setlists(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((state = 'draft' and published_at is null) or (state <> 'draft' and published_at is not null))
);

create unique index one_final_setlist_per_project
  on public.setlists(project_id)
  where state = 'final';

create table public.setlist_items (
  setlist_id uuid not null references public.setlists(id) on delete cascade,
  piece_id uuid not null references public.pieces(id) on delete restrict,
  position integer not null check (position >= 1),
  primary key (setlist_id, piece_id),
  unique (setlist_id, position)
);

create table public.setlist_ratings (
  setlist_id uuid not null references public.setlists(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  comment text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (setlist_id, user_id)
);

-- Save the complete state of an own draft in one transaction. The UI may send
-- several rapid changes; each accepted call either persists the whole snapshot
-- or leaves the previous database state untouched.
create or replace function public.save_own_setlist_draft(
  requested_setlist_id uuid,
  requested_name text,
  requested_piece_ids uuid[],
  requested_publish boolean default false
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_project_id uuid;
  normalized_piece_ids uuid[] := coalesce(requested_piece_ids, array[]::uuid[]);
begin
  if auth.uid() is null then
    raise exception 'Anmeldung erforderlich.';
  end if;

  if length(trim(coalesce(requested_name, ''))) not between 1 and 120 then
    raise exception 'Der Setlist-Name muss zwischen 1 und 120 Zeichen lang sein.';
  end if;

  select project_id into target_project_id
  from public.setlists
  where id = requested_setlist_id
    and owner_id = auth.uid()
    and state = 'draft'
  for update;

  if not found then
    raise exception 'Der Entwurf wurde nicht gefunden oder ist bereits veröffentlicht.';
  end if;

  if cardinality(normalized_piece_ids) <> (
    select count(distinct piece_id)
    from unnest(normalized_piece_ids) as item(piece_id)
  ) then
    raise exception 'Ein Stück darf nur einmal in einer Setlist vorkommen.';
  end if;

  if exists (
    select 1
    from unnest(normalized_piece_ids) as item(requested_piece_id)
    where not exists (
      select 1
      from public.pieces
      where id = requested_piece_id
        and project_id = target_project_id
        and archived = false
    )
  ) then
    raise exception 'Mindestens ein Stück gehört nicht zu diesem Projekt oder ist archiviert.';
  end if;

  delete from public.setlist_items where setlist_id = requested_setlist_id;

  insert into public.setlist_items (setlist_id, piece_id, position)
  select requested_setlist_id, piece_id, position::integer
  from unnest(normalized_piece_ids) with ordinality as item(piece_id, position);

  update public.setlists
  set name = trim(requested_name),
      state = case when requested_publish then 'published'::public.setlist_state else 'draft'::public.setlist_state end,
      published_at = case when requested_publish then now() else null end,
      updated_at = now()
  where id = requested_setlist_id;
end;
$$;

revoke all on function public.save_own_setlist_draft(uuid, text, uuid[], boolean) from public;
grant execute on function public.save_own_setlist_draft(uuid, text, uuid[], boolean) to authenticated;

create index pieces_project_id_idx on public.pieces(project_id);
create index app_settings_maintenance_started_by_idx on public.app_settings(maintenance_started_by);
create index piece_ratings_piece_id_idx on public.piece_ratings(piece_id);
create index piece_ratings_user_id_idx on public.piece_ratings(user_id);
create index project_members_user_id_idx on public.project_members(user_id);
create index projects_created_by_idx on public.projects(created_by);
create index setlists_project_state_idx on public.setlists(project_id, state);
create index setlists_owner_id_idx on public.setlists(owner_id);
create index setlists_derived_from_idx on public.setlists(derived_from);
create index setlist_items_setlist_position_idx on public.setlist_items(setlist_id, position);
create index setlist_items_piece_id_idx on public.setlist_items(piece_id);
create index setlist_ratings_setlist_id_idx on public.setlist_ratings(setlist_id);
create index setlist_ratings_user_id_idx on public.setlist_ratings(user_id);
create index signup_allowed_emails_added_by_idx on public.signup_allowed_emails(added_by);
create index signup_blocked_emails_blocked_by_idx on public.signup_blocked_emails(blocked_by);

create or replace function private.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.is_app_admin from public.profiles p where p.id = (select auth.uid())), false)
$$;

create or replace function private.is_project_member(requested_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.project_members pm
    where pm.project_id = requested_project_id
      and pm.user_id = (select auth.uid())
      and pm.status = 'active'
  )
$$;

create or replace function private.is_project_admin(requested_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_app_admin() or exists (
    select 1 from public.project_members pm
    where pm.project_id = requested_project_id
      and pm.user_id = (select auth.uid())
      and pm.status = 'active'
      and pm.role = 'admin'
  )
$$;

create or replace function private.can_view_setlist(requested_setlist_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.setlists s
    where s.id = requested_setlist_id
      and (
        (s.state = 'draft' and s.owner_id = (select auth.uid()))
        or (s.state <> 'draft' and private.is_project_member(s.project_id))
        or private.is_project_admin(s.project_id)
      )
  )
$$;

-- Keep the piece-ratings SELECT policy from querying its own RLS-protected
-- table directly, which would cause infinite policy recursion.
create or replace function private.has_own_piece_rating(requested_piece_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.piece_ratings own
      where own.piece_id = requested_piece_id
        and own.user_id = (select auth.uid())
    )
$$;

revoke all on function private.is_app_admin() from public;
revoke all on function private.is_project_member(uuid) from public;
revoke all on function private.is_project_admin(uuid) from public;
revoke all on function private.can_view_setlist(uuid) from public;
revoke all on function private.has_own_piece_rating(uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.is_app_admin() to authenticated;
grant execute on function private.is_project_member(uuid) to authenticated;
grant execute on function private.is_project_admin(uuid) to authenticated;
grant execute on function private.can_view_setlist(uuid) to authenticated;
grant execute on function private.has_own_piece_rating(uuid) to authenticated;

create or replace function private.before_user_created(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate_email extensions.citext := lower(event->'user'->>'email');
  candidate_code text := upper(trim(coalesce(event->'user'->'user_metadata'->>'signup_code', '')));
  expected_code_hash text;
begin
  if candidate_email is null then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 400,
      'message', 'Für die Anmeldung wird eine E-Mail-Adresse benötigt.'
    ));
  end if;

  if exists (select 1 from public.signup_blocked_emails b where b.email = candidate_email) then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message', 'Diese E-Mail-Adresse ist für den Setlist-o-Mat gesperrt.'
    ));
  end if;

  select s.code_hash into expected_code_hash
  from private.signup_access s
  where s.id = true;

  if expected_code_hash is null
     or encode(extensions.digest(candidate_code, 'sha256'), 'hex') <> expected_code_hash then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message', 'Der Gruppencode ist nicht korrekt.'
    ));
  end if;

  if candidate_email::text like '%@musikverein-verl.de'
     or exists (select 1 from public.signup_allowed_emails a where a.email = candidate_email) then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'Diese E-Mail-Adresse steht noch nicht auf der Freigabeliste. Bitte die Administration kurz per WhatsApp informieren.'
  ));
end;
$$;

revoke all on function private.before_user_created(jsonb) from public, anon, authenticated;
grant usage on schema private to supabase_auth_admin;
grant execute on function private.before_user_created(jsonb) to supabase_auth_admin;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate_email extensions.citext := lower(new.email);
  candidate_name text;
begin
  candidate_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
    (select a.display_name from public.signup_allowed_emails a where a.email = candidate_email),
    split_part(candidate_email::text, '@', 1)
  );

  insert into public.profiles (id, email, display_name, is_app_admin)
  values (
    new.id,
    candidate_email,
    candidate_name,
    false
  );

  insert into public.project_members (project_id, user_id, role)
  select p.id, new.id, 'member'::public.project_role
  from public.projects p
  where p.status = 'active'
  on conflict (project_id, user_id) do nothing;
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

alter table public.profiles enable row level security;
alter table public.app_settings enable row level security;
alter table public.signup_allowed_emails enable row level security;
alter table public.signup_blocked_emails enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.pieces enable row level security;
alter table public.piece_ratings enable row level security;
alter table public.setlists enable row level security;
alter table public.setlist_items enable row level security;
alter table public.setlist_ratings enable row level security;

create policy "profiles visible to shared project members"
on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or private.is_app_admin()
  or exists (
    select 1
    from public.project_members mine
    join public.project_members theirs on theirs.project_id = mine.project_id
    where mine.user_id = (select auth.uid()) and mine.status = 'active'
      and theirs.user_id = profiles.id and theirs.status = 'active'
  )
);

create policy "users update their own profile"
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()) and is_app_admin = private.is_app_admin());

create policy "app admins manage profiles"
on public.profiles for all to authenticated
using (private.is_app_admin()) with check (private.is_app_admin());

create policy "everyone reads maintenance status"
on public.app_settings for select to anon, authenticated
using (true);

create policy "app admins update maintenance status"
on public.app_settings for update to authenticated
using (private.is_app_admin()) with check (private.is_app_admin());

create policy "app admins manage allowlist"
on public.signup_allowed_emails for all to authenticated
using (private.is_app_admin()) with check (private.is_app_admin());

create policy "app admins manage blocklist"
on public.signup_blocked_emails for all to authenticated
using (private.is_app_admin()) with check (private.is_app_admin());

create policy "members view projects"
on public.projects for select to authenticated
using (private.is_project_member(id) or private.is_project_admin(id));

create policy "app admins create projects"
on public.projects for insert to authenticated
with check (private.is_app_admin());

create policy "project admins update projects"
on public.projects for update to authenticated
using (private.is_project_admin(id)) with check (private.is_project_admin(id));

create policy "app admins delete projects"
on public.projects for delete to authenticated
using (private.is_app_admin());

create policy "members view project memberships"
on public.project_members for select to authenticated
using (private.is_project_member(project_id) or private.is_project_admin(project_id));

create policy "project admins manage memberships"
on public.project_members for all to authenticated
using (private.is_project_admin(project_id)) with check (private.is_project_admin(project_id));

create policy "members view pieces"
on public.pieces for select to authenticated
using (private.is_project_member(project_id) or private.is_project_admin(project_id));

create policy "project admins manage pieces"
on public.pieces for all to authenticated
using (private.is_project_admin(project_id)) with check (private.is_project_admin(project_id));

create policy "users view own or unlocked piece ratings"
on public.piece_ratings for select to authenticated
using (
  user_id = (select auth.uid())
  or private.is_app_admin()
  or (
    private.is_project_member((select p.project_id from public.pieces p where p.id = piece_ratings.piece_id))
    and private.has_own_piece_rating(piece_ratings.piece_id)
  )
);

create policy "users create own piece ratings"
on public.piece_ratings for insert to authenticated
with check (
  user_id = (select auth.uid())
  and private.is_project_member((select p.project_id from public.pieces p where p.id = piece_id))
);

create policy "users change own piece ratings"
on public.piece_ratings for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "users delete own piece ratings"
on public.piece_ratings for delete to authenticated
using (user_id = (select auth.uid()));

create policy "members view published and owners view draft setlists"
on public.setlists for select to authenticated
using (
  (state = 'draft' and owner_id = (select auth.uid()))
  or (state <> 'draft' and private.is_project_member(project_id))
  or private.is_project_admin(project_id)
);

create policy "members create their own draft setlists"
on public.setlists for insert to authenticated
with check (
  owner_id = (select auth.uid()) and state = 'draft' and private.is_project_member(project_id)
);

create policy "owners edit or publish only their draft setlists"
on public.setlists for update to authenticated
using (owner_id = (select auth.uid()) and state = 'draft')
with check (
  owner_id = (select auth.uid())
  and state in ('draft', 'published')
  and private.is_project_member(project_id)
);

create policy "admins select finalists and final setlist"
on public.setlists for update to authenticated
using (state <> 'draft' and private.is_project_admin(project_id))
with check (state <> 'draft' and private.is_project_admin(project_id));

create policy "owners or admins delete setlists"
on public.setlists for delete to authenticated
using (
  owner_id = (select auth.uid())
  or private.is_project_admin(project_id)
);

create policy "visible setlist items can be read"
on public.setlist_items for select to authenticated
using (private.can_view_setlist(setlist_id));

create policy "owners add items to their drafts"
on public.setlist_items for insert to authenticated
with check (exists (
  select 1 from public.setlists s
  where s.id = setlist_id and s.owner_id = (select auth.uid()) and s.state = 'draft'
));

create policy "owners reorder items in their drafts"
on public.setlist_items for update to authenticated
using (exists (
  select 1 from public.setlists s
  where s.id = setlist_id and s.owner_id = (select auth.uid()) and s.state = 'draft'
))
with check (exists (
  select 1 from public.setlists s
  where s.id = setlist_id and s.owner_id = (select auth.uid()) and s.state = 'draft'
));

create policy "owners remove items from their drafts"
on public.setlist_items for delete to authenticated
using (exists (
  select 1 from public.setlists s
  where s.id = setlist_id and s.owner_id = (select auth.uid()) and s.state = 'draft'
));

create policy "members view ratings of published setlists"
on public.setlist_ratings for select to authenticated
using (private.can_view_setlist(setlist_id));

create policy "members rate published setlists"
on public.setlist_ratings for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.setlists s
    where s.id = setlist_id and s.state <> 'draft' and private.is_project_member(s.project_id)
  )
);

create policy "users change their setlist rating"
on public.setlist_ratings for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "users delete their setlist rating"
on public.setlist_ratings for delete to authenticated
using (user_id = (select auth.uid()));

-- Supabase projects created in 2026 do not automatically expose Data API privileges.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
grant usage on schema public to anon;
grant select on public.app_settings to anon;

-- The admin Edge Functions use Supabase's server-side secret key. New projects
-- can start without Data API table privileges for service_role, so grant only
-- what these functions need to verify admins and mark password resets.
grant usage on schema public to service_role;
grant select, update on public.profiles to service_role;

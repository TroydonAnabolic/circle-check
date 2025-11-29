-- Run this in Supabase SQL editor

-- Profiles
create table if not exists profiles (
  id uuid primary key,
  email text unique,
  created_at timestamptz default now()
);
alter table profiles enable row level security;
create policy "read own profile" on profiles for select using (id = auth.uid());
create policy "insert profile via trigger" on profiles for insert with check (true);

-- Sync auth.users -> profiles
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Circles
create table if not exists circles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null,
  created_at timestamptz not null default now()
);
alter table circles enable row level security;

-- BEFORE INSERT: set created_by
create or replace function public.set_circle_creator()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;
drop trigger if exists before_circle_insert_set_creator on circles;
create trigger before_circle_insert_set_creator
before insert on circles
for each row execute procedure public.set_circle_creator();

-- Memberships
create table if not exists memberships (
  circle_id uuid not null references circles(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (circle_id, user_id)
);
alter table memberships enable row level security;

-- Add an optional color per (circle_id, user_id)
alter table if exists memberships
  add column if not exists color text; -- hex like '#2f95dc'

-- AFTER INSERT: auto-join creator
create or replace function public.auto_join_circle_creator()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into memberships (circle_id, user_id)
  values (new.id, auth.uid())
  on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists on_circle_created on circles;
create trigger on_circle_created
after insert on circles
for each row execute procedure public.auto_join_circle_creator();

-- RLS policies
-- Circles: insert by signed-in users
create policy "create circles" on circles for insert with check (auth.uid() is not null);

-- Circles: read if creator OR member
create policy "read circles by creator or member"
on circles for select
using (
  created_by = auth.uid()
  or exists (
    select 1 from memberships m where m.circle_id = circles.id and m.user_id = auth.uid()
  )
);

-- Memberships: insert only yourself (to join circles you are invited to)
create policy "join circle" on memberships for insert with check (user_id = auth.uid());

-- Memberships: read only your own rows
drop policy if exists "read memberships for my circles" on memberships; -- remove recursive policy
create policy "read own memberships" on memberships for select using (user_id = auth.uid());

-- Invites (from your previous step)
create table if not exists invites (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references circles(id) on delete cascade,
  invitee_email text not null,
  invited_by uuid not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);
alter table invites enable row level security;
create policy "read invites as inviter"
  on invites for select
  using (invited_by = auth.uid() and exists (select 1 from memberships me where me.circle_id = invites.circle_id and me.user_id = auth.uid()));
create policy "read invites as invitee"
  on invites for select
  using (invitee_email = (select email from profiles where id = auth.uid()));
create policy "create invites"
  on invites for insert
  with check (invited_by = auth.uid() and exists (select 1 from memberships me where me.circle_id = invites.circle_id and me.user_id = auth.uid()));
create policy "update invites status"
  on invites for update
  using (invited_by = auth.uid() or invitee_email = (select email from profiles where id = auth.uid()))
  with check (true);

-- RPCs
create or replace function public.get_circle_members(circle_id uuid, requester_id uuid)
returns table (user_id uuid, email text, joined_at timestamptz)
language sql security definer set search_path = public as $$
  with allowed as (
    select 1 from memberships where circle_id = $1 and user_id = $2
  )
  select m.user_id, p.email, m.created_at
  from memberships m
  join profiles p on p.id = m.user_id
  where m.circle_id = $1
    and exists (select 1 from allowed);
$$;

drop function if exists public.invite_member(uuid, uuid, text);
create or replace function public.invite_member(p_circle_id uuid, p_requester_id uuid, p_invitee_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed boolean;
begin
  -- only members can invite
  select exists(
    select 1
    from memberships me
    where me.circle_id = p_circle_id
      and me.user_id   = p_requester_id
  ) into allowed;

  if not allowed then
    raise exception 'not_allowed';
  end if;

  -- create pending invite; avoid duplicates on same (circle_id, invitee_email)
  insert into invites (circle_id, invitee_email, invited_by, status)
  values (p_circle_id, p_invitee_email, p_requester_id, 'pending')
  on conflict do nothing;
end;
$$;

drop function if exists public.accept_invite(uuid, uuid);
create or replace function public.accept_invite(p_invite_id uuid, p_accepter_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_circle uuid;
  v_email  text;
begin
  select i.circle_id, i.invitee_email
    into v_circle, v_email
  from invites i
  join profiles p on p.id = p_accepter_id
  where i.id = p_invite_id
    and i.invitee_email = p.email
    and i.status = 'pending';

  if v_circle is null then
    raise exception 'not_allowed';
  end if;

  insert into memberships (circle_id, user_id)
  values (v_circle, p_accepter_id)
  on conflict (circle_id, user_id) do nothing;

  update invites set status = 'accepted' where id = p_invite_id;
end;
$$;

drop function if exists public.decline_invite(uuid, uuid);
create or replace function public.decline_invite(p_invite_id uuid, p_decliner_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update invites
  set status = 'declined'
  where id = $1
    and invitee_email = (select email from profiles where id = $2)
    and status = 'pending';
$$;

drop function if exists public.get_circle_member_locations(uuid);
create or replace function public.get_circle_member_locations(p_requester_id uuid)
returns table (user_id uuid, lat double precision, lng double precision, updated_at timestamptz, email text, color text)
language sql security definer set search_path = public as $$
  with my_circles as (
    select circle_id from memberships where user_id = p_requester_id
  )
  select l.user_id, l.lat, l.lng, l.updated_at, p.email, m.color
  from locations l
  join profiles    p on p.id = l.user_id
  join memberships m on m.user_id = l.user_id
  where m.circle_id in (select circle_id from my_circles)
$$;

-- Fix: recreate the update policy without IF NOT EXISTS
drop policy if exists "update my circle membership color" on memberships;

create policy "update my circle membership color"
on memberships
for update
using (
  exists (
    select 1
    from memberships me
    where me.circle_id = memberships.circle_id
      and me.user_id = auth.uid()
  )
)
with check (true);
-- Run this in Supabase SQL editor

create table if not exists profiles (
  id uuid primary key default uuid_generate_v4(),
  email text unique not null,
  created_at timestamptz default now()
);

create table if not exists circles (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  created_at timestamptz default now()
);

create table if not exists memberships (
  circle_id uuid references circles(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (circle_id, user_id)
);

create table if not exists locations (
  user_id uuid primary key references profiles(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  updated_at timestamptz not null default now()
);

-- Sync Supabase auth users -> profiles
create or replace function public.handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Helper: get locations of members who share circles with requester (excluding requester)
create or replace function public.get_circle_member_locations(requester_id uuid)
returns table (user_id uuid, lat double precision, lng double precision, updated_at timestamptz, profiles jsonb)
language sql security definer as $$
  with requester_circles as (
    select circle_id from memberships where user_id = requester_id
  ),
  circle_members as (
    select m.user_id
    from memberships m
    join requester_circles rc on rc.circle_id = m.circle_id
    where m.user_id <> requester_id
  )
  select l.user_id, l.lat, l.lng, l.updated_at,
         to_jsonb(p.*) - 'created_at' as profiles
  from locations l
  join circle_members cm on cm.user_id = l.user_id
  join profiles p on p.id = l.user_id;
$$;

-- Row Level Security
alter table profiles enable row level security;
alter table circles enable row level security;
alter table memberships enable row level security;
alter table locations enable row level security;

-- Profiles: users can read their own profile and lookup by email for invitations
create policy "read own profile"
  on profiles for select
  using (id = auth.uid());

create policy "lookup by email for invite"
  on profiles for select
  using (true);

-- Circles: authenticated users can create circles and read those they belong to
create policy "create circles"
  on circles for insert
  with check (auth.uid() is not null);

create policy "read circles by membership"
  on circles for select
  using (exists (select 1 from memberships m where m.circle_id = id and m.user_id = auth.uid()));

-- Memberships: manage own memberships
create policy "join circle"
  on memberships for insert
  with check (user_id = auth.uid());

create policy "read my memberships"
  on memberships for select
  using (user_id = auth.uid());

-- Locations: only update your own location, and select locations for circle members via RPC
create policy "update own location"
  on locations for insert
  with check (user_id = auth.uid());

create policy "update own location upsert"
  on locations for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "read own location"
  on locations for select
  using (user_id = auth.uid());
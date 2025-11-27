-- Device tokens (multiple devices per user)
create table if not exists device_tokens (
  token text primary key,
  user_id uuid references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Track when users want to be alerted if a circle member enters this radius
create table if not exists radius_subscriptions (
  id uuid primary key default uuid_generate_v4(),
  owner_user_id uuid references profiles(id) on delete cascade,
  center_lat double precision not null,
  center_lng double precision not null,
  radius_m integer not null check (radius_m >= 10 and radius_m <= 100000), -- 10m to 100km
  enabled boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Keep state to avoid duplicate notifications (inside/outside)
create table if not exists entry_states (
  subscription_id uuid references radius_subscriptions(id) on delete cascade,
  subject_user_id uuid references profiles(id) on delete cascade,
  inside boolean not null default false,
  updated_at timestamptz default now(),
  primary key (subscription_id, subject_user_id)
);

-- RLS
alter table device_tokens enable row level security;
alter table radius_subscriptions enable row level security;
alter table entry_states enable row level security;

-- Users manage their own tokens
create policy "insert own tokens"
  on device_tokens for insert
  with check (auth.uid() = user_id);

create policy "update own tokens"
  on device_tokens for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "select own tokens"
  on device_tokens for select
  using (auth.uid() = user_id);

-- Users manage their own subscriptions
create policy "insert own subscription"
  on radius_subscriptions for insert
  with check (auth.uid() = owner_user_id);

create policy "update own subscription"
  on radius_subscriptions for update
  using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);

create policy "select own subscription"
  on radius_subscriptions for select
  using (auth.uid() = owner_user_id);

-- entry_states will be managed by Edge Function using service role (no RLS policies required for clients).

-- RPC to find which subscriptions belong to users who share a circle with the subject user
create or replace function public.get_relevant_radius_subscriptions(subject_user uuid)
returns table (
  subscription_id uuid,
  owner_user_id uuid,
  center_lat double precision,
  center_lng double precision,
  radius_m integer
) language sql stable as $$
  with owners as (
    select distinct m_owner.user_id as owner_user_id
    from memberships m_owner
    join memberships m_subject
      on m_subject.circle_id = m_owner.circle_id
    where m_subject.user_id = subject_user
      and m_owner.user_id <> subject_user
  )
  select rs.id, rs.owner_user_id, rs.center_lat, rs.center_lng, rs.radius_m
  from radius_subscriptions rs
  join owners o on o.owner_user_id = rs.owner_user_id
  where rs.enabled = true;
$$;
drop function if exists public.get_circle_member_locations(uuid);
create or replace function public.get_circle_member_locations(p_requester_id uuid)
returns table (
  user_id uuid,
  lat double precision,
  lng double precision,
  updated_at timestamptz,
  email text,
  color text
)
language sql
security definer
set search_path = public
as $$
  with my_circles as (
    select circle_id from memberships where user_id = p_requester_id
  )
  select
    l.user_id,
    l.lat,
    l.lng,
    l.updated_at,
    p.email,
    m.color
  from locations l
  join profiles    p on p.id = l.user_id
  join memberships m on m.user_id = l.user_id
  where m.circle_id in (select circle_id from my_circles)
$$;
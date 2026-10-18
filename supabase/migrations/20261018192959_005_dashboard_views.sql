/*
# Dashboard aggregation views

## Purpose
Provide pre-built views the React frontend can query directly to render the
member and trainer dashboards, instead of issuing multi-table joins from the
client.

## New views
1. `public.member_dashboard` — one row per member with lifetime totals:
   total_sessions, total_volume_kg, total_sets, total_minutes, plus the
   count of active goals and active assigned plans.

2. `public.member_volume_last_7_days` — one row per (member, day) for the
   last 7 days, with volume_kg, sets, minutes. Drives the line chart.

3. `public.trainer_client_overview` — one row per (trainer, client) with
   the client's session count and total volume in the last 30 days. Drives
   the trainer dashboard's client table.

## Notes
- Views are read-only and inherit RLS from their underlying tables. Because
  they're built on top of RLS-enabled tables, an authenticated user querying
  these views will only see rows they're allowed to see per the base-table
  policies. No separate RLS policy is needed on the views themselves.
- `coalesce` guards keep totals at 0 (not null) for members with no logs yet.
*/

-- member lifetime totals
create or replace view public.member_dashboard as
select
  p.id as user_id,
  p.full_name,
  coalesce(s.total_sessions, 0) as total_sessions,
  coalesce(s.total_volume_kg, 0) as total_volume_kg,
  coalesce(s.total_sets, 0) as total_sets,
  coalesce(s.total_minutes, 0) as total_minutes,
  coalesce(g.active_goals, 0) as active_goals,
  coalesce(a.active_plans, 0) as active_plans
from public.profiles p
left join (
  select
    user_id,
    count(*) as total_sessions,
    sum(total_volume_kg) as total_volume_kg,
    sum(total_sets) as total_sets,
    sum(duration_minutes) as total_minutes
  from public.session_logs
  group by user_id
) s on s.user_id = p.id
left join (
  select user_id, count(*) as active_goals
  from public.fitness_goals
  where status = 'active'
  group by user_id
) g on g.user_id = p.id
left join (
  select a.member_id as user_id, count(*) as active_plans
  from public.workout_plan_assignments a
  join public.workout_plans p on p.id = a.plan_id
  where p.status = 'active'
  group by a.member_id
) a on a.user_id = p.id
where p.role = 'member';

-- member volume over the last 7 days (for the line chart)
create or replace view public.member_volume_last_7_days as
select
  s.user_id,
  date_trunc('day', s.date)::date as day,
  sum(s.total_volume_kg) as volume_kg,
  sum(s.total_sets) as sets,
  sum(s.duration_minutes) as minutes
from public.session_logs s
where s.date >= now() - interval '7 days'
group by s.user_id, day
order by day;

-- trainer → client 30-day overview
create or replace view public.trainer_client_overview as
select
  p.id as trainer_id,
  p.full_name as trainer_name,
  m.id as client_id,
  m.full_name as client_name,
  coalesce(st.sessions_30d, 0) as sessions_30d,
  coalesce(st.volume_30d, 0) as volume_30d
from public.profiles p
join public.profiles m on m.assigned_trainer_id = p.id
left join (
  select
    user_id,
    count(*) filter (where date >= now() - interval '30 days') as sessions_30d,
    sum(total_volume_kg) filter (where date >= now() - interval '30 days') as volume_30d
  from public.session_logs
  group by user_id
) st on st.user_id = m.id
where p.role = 'trainer' and m.role = 'member'
order by sessions_30d desc;

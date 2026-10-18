/*
# Harden functions: pin search_path and lock down signup trigger

## Purpose
The security advisor flagged all custom functions for a mutable `search_path`
(WARN) and flagged `handle_new_user` as a SECURITY DEFINER function callable
by anon/authenticated roles. Both are worth fixing:
- RLS helper functions (`current_app_role`, `is_staff`, `is_trainer_or_staff`,
  `owner_of_session`, `owner_of_exercise_log`, `plan_of_day`) are used inside
  RLS policies. A mutable search_path on these is a real risk because an
  attacker who can create objects in another schema could shadow lookups.
- Trigger/aggregation functions don't need a mutable search_path either.
- `handle_new_user` is SECURITY DEFINER (it must write to `public.profiles`
  on behalf of a freshly-created user). It only needs to run as a trigger,
  so we revoke EXECUTE from `anon` and `authenticated` — trigger invocation
  doesn't depend on the EXECUTE privilege.

## Changes
1. Recreate every custom function with `SET search_path = public` (or
   `public, pg_catalog` where needed). Function bodies are unchanged.
2. Revoke EXECUTE on `handle_new_user` from `anon` and `authenticated`.

## Security
- All RLS helper functions now have an immutable search_path, eliminating
  search-path shadowing attacks against the policies that use them.
- `handle_new_user` can no longer be called directly by anon/authenticated
  clients; it still fires as the auth.users INSERT trigger (trigger
  functions run with the owner's privileges regardless of EXECUTE grants).
*/

-- ---------- role helpers ----------
create or replace function public.current_app_role()
returns text
language sql stable
set search_path = public
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', 'anon');
$$;

create or replace function public.is_staff()
returns boolean
language sql stable
set search_path = public
as $$
  select public.current_app_role() in ('management', 'admin');
$$;

create or replace function public.is_trainer_or_staff()
returns boolean
language sql stable
set search_path = public
as $$
  select public.current_app_role() in ('trainer', 'management', 'admin');
$$;

-- ---------- updated_at trigger ----------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------- signup handler (SECURITY DEFINER, search_path locked, execute revoked) ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, is_email_verified)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    coalesce(new.raw_app_meta_data ->> 'role', 'member'),
    coalesce((new.email_confirmed_at is not null), false)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;

-- ---------- plan/day helpers ----------
create or replace function public.plan_of_day(day_uuid uuid)
returns uuid
language sql stable
set search_path = public
as $$
  select plan_id from public.workout_plan_days where id = day_uuid;
$$;

create or replace function public.owner_of_session(session_uuid uuid)
returns uuid
language sql stable
set search_path = public
as $$
  select user_id from public.session_logs where id = session_uuid;
$$;

create or replace function public.owner_of_exercise_log(elog_uuid uuid)
returns uuid
language sql stable
set search_path = public
as $$
  select s.user_id
  from public.session_logs s
  join public.exercise_logs e on e.session_log_id = s.id
  where e.id = elog_uuid;
$$;

-- ---------- aggregation helpers ----------
create or replace function public.recompute_exercise_log_volume(elog_uuid uuid)
returns void
language plpgsql
set search_path = public
as $$
begin
  update public.exercise_logs e
  set total_volume_kg = (
    select coalesce(sum(s.reps * s.weight_kg), 0)
    from public.set_logs s
    where s.exercise_log_id = elog_uuid and s.completed
  )
  where e.id = elog_uuid;
end;
$$;

create or replace function public.trg_set_logs_recompute_exercise()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.recompute_exercise_log_volume(
    coalesce(new.exercise_log_id, old.exercise_log_id)
  );
  return null;
end;
$$;

create or replace function public.recompute_session_totals(session_uuid uuid)
returns void
language plpgsql
set search_path = public
as $$
begin
  update public.session_logs s
  set
    total_volume_kg = (
      select coalesce(sum(e.total_volume_kg), 0)
      from public.exercise_logs e where e.session_log_id = session_uuid
    ),
    total_sets = (
      select coalesce(count(*), 0)
      from public.exercise_logs e
      join public.set_logs l on l.exercise_log_id = e.id
      where e.session_log_id = session_uuid and l.completed
    )
  where s.id = session_uuid;
end;
$$;

create or replace function public.trg_exercise_logs_recompute_session()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.recompute_session_totals(
    coalesce(new.session_log_id, old.session_log_id)
  );
  return null;
end;
$$;

create or replace function public.trg_set_logs_recompute_session()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  sid uuid;
begin
  select e.session_log_id into sid
  from public.exercise_logs e
  where e.id = coalesce(new.exercise_log_id, old.exercise_log_id);
  if sid is not null then
    perform public.recompute_session_totals(sid);
  end if;
  return null;
end;
$$;

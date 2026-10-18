/*
# Session logs, exercise logs, set logs, and body measurements

## Purpose
- Capture what a member actually did in a workout: the session header, the
  exercises they performed, and each individual set (reps, weight, RPE).
- Track body composition and circumference measurements over time so the
  dashboard can chart progress independent of workout volume.

## New tables
1. `public.session_logs` — one row per workout session
   - `id` (uuid, PK)
   - `user_id` (uuid, not null, default auth.uid()) → profiles(id) ON DELETE CASCADE
   - `workout_plan_id` (uuid) → workout_plans(id) ON DELETE SET NULL
   - `date` (timestamptz, not null, default now)
   - `day_label` (text)
   - `duration_minutes` (int)
   - `total_volume_kg` (numeric, default 0) — maintained by trigger
   - `total_sets` (int, default 0) — maintained by trigger
   - `calories_burned` (int)
   - `mood` (text) — great, good, okay, tired, poor
   - `perceived_exertion` (int, 1–10)
   - `location` (text) — gym, home, outdoor, other (default gym)
   - `notes` (text, ≤1000)
   - `is_verified` (boolean, default false) — trainer sign-off
   - `verified_by` (uuid) → profiles(id) ON DELETE SET NULL
   - `verified_at` (timestamptz)
   - `created_at`, `updated_at` (timestamptz)

2. `public.exercise_logs` — one row per exercise performed in a session
   - `id` (uuid, PK)
   - `session_log_id` (uuid, not null) → session_logs(id) ON DELETE CASCADE
   - `exercise_id` (uuid) → exercises(id) ON DELETE SET NULL
   - `exercise_name` (text) — denormalized snapshot so history survives edits
   - `exercise_category` (text) — denormalized snapshot
   - `planned_sets` (int)
   - `total_volume_kg` (numeric, default 0) — maintained by trigger

3. `public.set_logs` — one row per set performed
   - `id` (uuid, PK)
   - `exercise_log_id` (uuid, not null) → exercise_logs(id) ON DELETE CASCADE
   - `set_number` (int, ≥1, not null)
   - `reps` (int, ≥0, not null)
   - `weight_kg` (numeric, default 0)
   - `duration_seconds` (int) — for timed/cardio sets
   - `distance_meters` (int) — for cardio
   - `rpe` (int, 1–10) — rate of perceived exertion
   - `completed` (boolean, default true)
   - `notes` (text, ≤200)

4. `public.body_measurements` — body composition + circumference over time
   - `id` (uuid, PK)
   - `user_id` (uuid, not null, default auth.uid()) → profiles(id) ON DELETE CASCADE
   - `date` (timestamptz, not null, default now)
   - `weight_kg`, `height_cm`, `body_fat_percent`, `muscle_mass_kg`, `bmi` (numeric)
   - `chest_cm`, `waist_cm`, `hip_cm`, `bicep_cm`, `thigh_cm`, `calf_cm`,
     `forearm_cm`, `neck_cm` (numeric) — circumferences
   - `resting_heart_rate`, `blood_pressure_systolic`, `blood_pressure_diastolic` (int)
   - `notes` (text, ≤500)
   - `recorded_by` (uuid, not null) → profiles(id) ON DELETE SET NULL
   - `created_at`, `updated_at` (timestamptz)

## Aggregation triggers
- After insert/update/delete on `set_logs`, recompute the parent
  `exercise_logs.total_volume_kg` (sum of reps*weight for completed sets).
- After insert/update/delete on `exercise_logs` (or via the set_logs trigger
  cascading up), recompute the parent `session_logs.total_volume_kg` and
  `total_sets`. This mirrors the Mongoose pre-save hooks and keeps the
  dashboard reads correct without runtime aggregation.

## Security
- RLS enabled on all four tables.
- Session logs: owner reads/writes their own; trainers and staff can read
  any (needed for client oversight) and can flip `is_verified` (trainer
  sign-off) via the update policy — but only the owner can change the
  workout contents. To keep the policy simple and safe, the UPDATE policy
  allows the owner OR trainer/staff; trainer sign-off is the main non-owner
  update use case.
- Exercise logs + set logs: read access inherits from the parent session
  (owner, trainer, or staff). Write access is the session owner only —
  trainers don't edit a member's logged sets, they only verify the session.
- Body measurements: owner reads/writes; trainers and staff may read (for
  client progress) and may insert on behalf of a member (e.g. a trainer
  recording a measurement during a session). Updates/deletes are owner-only
  or staff.
*/

-- ---------- session_logs ----------
create table if not exists public.session_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references public.profiles(id) on delete cascade,
  workout_plan_id uuid references public.workout_plans(id) on delete set null,
  date timestamptz not null default now(),
  day_label text,
  duration_minutes int check (duration_minutes is null or duration_minutes >= 0),
  total_volume_kg numeric not null default 0,
  total_sets int not null default 0,
  calories_burned int check (calories_burned is null or calories_burned >= 0),
  mood text check (mood in ('great','good','okay','tired','poor')),
  perceived_exertion int check (perceived_exertion is null or perceived_exertion between 1 and 10),
  location text not null default 'gym' check (location in ('gym','home','outdoor','other')),
  notes text check (char_length(notes) <= 1000),
  is_verified boolean not null default false,
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sessions_user_date_idx on public.session_logs (user_id, date desc);
create index if not exists sessions_plan_idx on public.session_logs (workout_plan_id);
create index if not exists sessions_verified_idx on public.session_logs (is_verified);

alter table public.session_logs enable row level security;

drop policy if exists "sessions_owner_or_staff_read" on public.session_logs;
create policy "sessions_owner_or_staff_read"
  on public.session_logs for select to authenticated
  using (user_id = auth.uid() or public.is_trainer_or_staff());

drop policy if exists "sessions_owner_insert" on public.session_logs;
create policy "sessions_owner_insert"
  on public.session_logs for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "sessions_owner_or_staff_update" on public.session_logs;
create policy "sessions_owner_or_staff_update"
  on public.session_logs for update to authenticated
  using (user_id = auth.uid() or public.is_trainer_or_staff())
  with check (user_id = auth.uid() or public.is_trainer_or_staff());

drop policy if exists "sessions_owner_or_staff_delete" on public.session_logs;
create policy "sessions_owner_or_staff_delete"
  on public.session_logs for delete to authenticated
  using (user_id = auth.uid() or public.is_staff());

drop trigger if exists sessions_touch_updated_at on public.session_logs;
create trigger sessions_touch_updated_at
  before update on public.session_logs
  for each row execute function public.touch_updated_at();

-- ---------- exercise_logs ----------
create table if not exists public.exercise_logs (
  id uuid primary key default gen_random_uuid(),
  session_log_id uuid not null references public.session_logs(id) on delete cascade,
  exercise_id uuid references public.exercises(id) on delete set null,
  exercise_name text,
  exercise_category text,
  planned_sets int check (planned_sets is null or planned_sets >= 1),
  total_volume_kg numeric not null default 0
);

create index if not exists exercise_logs_session_idx on public.exercise_logs (session_log_id);
create index if not exists exercise_logs_exercise_idx on public.exercise_logs (exercise_id);

alter table public.exercise_logs enable row level security;

-- helper: the owner of a session
create or replace function public.owner_of_session(session_uuid uuid)
returns uuid
language sql stable
as $$
  select user_id from public.session_logs where id = session_uuid;
$$;

drop policy if exists "exercise_logs_read" on public.exercise_logs;
create policy "exercise_logs_read"
  on public.exercise_logs for select to authenticated
  using (
    public.owner_of_session(exercise_logs.session_log_id) = auth.uid()
    or public.is_trainer_or_staff()
  );

drop policy if exists "exercise_logs_owner_insert" on public.exercise_logs;
create policy "exercise_logs_owner_insert"
  on public.exercise_logs for insert to authenticated
  with check (
    public.owner_of_session(exercise_logs.session_log_id) = auth.uid()
  );

drop policy if exists "exercise_logs_owner_update" on public.exercise_logs;
create policy "exercise_logs_owner_update"
  on public.exercise_logs for update to authenticated
  using (public.owner_of_session(exercise_logs.session_log_id) = auth.uid())
  with check (public.owner_of_session(exercise_logs.session_log_id) = auth.uid());

drop policy if exists "exercise_logs_owner_delete" on public.exercise_logs;
create policy "exercise_logs_owner_delete"
  on public.exercise_logs for delete to authenticated
  using (public.owner_of_session(exercise_logs.session_log_id) = auth.uid());

-- ---------- set_logs ----------
create table if not exists public.set_logs (
  id uuid primary key default gen_random_uuid(),
  exercise_log_id uuid not null references public.exercise_logs(id) on delete cascade,
  set_number int not null check (set_number >= 1),
  reps int not null check (reps >= 0),
  weight_kg numeric not null default 0 check (weight_kg >= 0),
  duration_seconds int check (duration_seconds is null or duration_seconds >= 0),
  distance_meters int check (distance_meters is null or distance_meters >= 0),
  rpe int check (rpe is null or rpe between 1 and 10),
  completed boolean not null default true,
  notes text check (char_length(notes) <= 200)
);

create index if not exists set_logs_exercise_log_idx on public.set_logs (exercise_log_id);
create index if not exists set_logs_position_idx on public.set_logs (exercise_log_id, set_number);

alter table public.set_logs enable row level security;

-- helper: the owner of an exercise_log (via its session)
create or replace function public.owner_of_exercise_log(elog_uuid uuid)
returns uuid
language sql stable
as $$
  select s.user_id
  from public.session_logs s
  join public.exercise_logs e on e.session_log_id = s.id
  where e.id = elog_uuid;
$$;

drop policy if exists "set_logs_read" on public.set_logs;
create policy "set_logs_read"
  on public.set_logs for select to authenticated
  using (
    public.owner_of_exercise_log(set_logs.exercise_log_id) = auth.uid()
    or public.is_trainer_or_staff()
  );

drop policy if exists "set_logs_owner_insert" on public.set_logs;
create policy "set_logs_owner_insert"
  on public.set_logs for insert to authenticated
  with check (
    public.owner_of_exercise_log(set_logs.exercise_log_id) = auth.uid()
  );

drop policy if exists "set_logs_owner_update" on public.set_logs;
create policy "set_logs_owner_update"
  on public.set_logs for update to authenticated
  using (public.owner_of_exercise_log(set_logs.exercise_log_id) = auth.uid())
  with check (public.owner_of_exercise_log(set_logs.exercise_log_id) = auth.uid());

drop policy if exists "set_logs_owner_delete" on public.set_logs;
create policy "set_logs_owner_delete"
  on public.set_logs for delete to authenticated
  using (public.owner_of_exercise_log(set_logs.exercise_log_id) = auth.uid());

-- ---------- aggregation: recompute exercise_logs.total_volume_kg from set_logs ----------
create or replace function public.recompute_exercise_log_volume(elog_uuid uuid)
returns void
language plpgsql
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
as $$
begin
  perform public.recompute_exercise_log_volume(
    coalesce(new.exercise_log_id, old.exercise_log_id)
  );
  return null;
end;
$$;

drop trigger if exists set_logs_after_ins on public.set_logs;
create trigger set_logs_after_ins
  after insert on public.set_logs
  for each row execute function public.trg_set_logs_recompute_exercise();

drop trigger if exists set_logs_after_upd on public.set_logs;
create trigger set_logs_after_upd
  after update on public.set_logs
  for each row execute function public.trg_set_logs_recompute_exercise();

drop trigger if exists set_logs_after_del on public.set_logs;
create trigger set_logs_after_del
  after delete on public.set_logs
  for each row execute function public.trg_set_logs_recompute_exercise();

-- ---------- aggregation: recompute session_logs totals from exercise_logs ----------
create or replace function public.recompute_session_totals(session_uuid uuid)
returns void
language plpgsql
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
as $$
begin
  perform public.recompute_session_totals(
    coalesce(new.session_log_id, old.session_log_id)
  );
  return null;
end;
$$;

drop trigger if exists exercise_logs_after_ins on public.exercise_logs;
create trigger exercise_logs_after_ins
  after insert on public.exercise_logs
  for each row execute function public.trg_exercise_logs_recompute_session();

drop trigger if exists exercise_logs_after_upd on public.exercise_logs;
create trigger exercise_logs_after_upd
  after update on public.exercise_logs
  for each row execute function public.trg_exercise_logs_recompute_session();

drop trigger if exists exercise_logs_after_del on public.exercise_logs;
create trigger exercise_logs_after_del
  after delete on public.exercise_logs
  for each row execute function public.trg_exercise_logs_recompute_session();

-- When set_logs change, the exercise_log volume trigger fires, but the
-- session totals won't recalc unless the exercise_logs row changes. Add a
-- direct session recompute on set_logs changes too.
create or replace function public.trg_set_logs_recompute_session()
returns trigger
language plpgsql
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

drop trigger if exists set_logs_recompute_session_ins on public.set_logs;
create trigger set_logs_recompute_session_ins
  after insert on public.set_logs
  for each row execute function public.trg_set_logs_recompute_session();

drop trigger if exists set_logs_recompute_session_upd on public.set_logs;
create trigger set_logs_recompute_session_upd
  after update on public.set_logs
  for each row execute function public.trg_set_logs_recompute_session();

drop trigger if exists set_logs_recompute_session_del on public.set_logs;
create trigger set_logs_recompute_session_del
  after delete on public.set_logs
  for each row execute function public.trg_set_logs_recompute_session();

-- ---------- body_measurements ----------
create table if not exists public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references public.profiles(id) on delete cascade,
  date timestamptz not null default now(),
  weight_kg numeric check (weight_kg is null or weight_kg >= 0),
  height_cm numeric check (height_cm is null or height_cm >= 0),
  body_fat_percent numeric check (body_fat_percent is null or body_fat_percent between 0 and 100),
  muscle_mass_kg numeric check (muscle_mass_kg is null or muscle_mass_kg >= 0),
  bmi numeric check (bmi is null or bmi >= 0),
  chest_cm numeric check (chest_cm is null or chest_cm >= 0),
  waist_cm numeric check (waist_cm is null or waist_cm >= 0),
  hip_cm numeric check (hip_cm is null or hip_cm >= 0),
  bicep_cm numeric check (bicep_cm is null or bicep_cm >= 0),
  thigh_cm numeric check (thigh_cm is null or thigh_cm >= 0),
  calf_cm numeric check (calf_cm is null or calf_cm >= 0),
  forearm_cm numeric check (forearm_cm is null or forearm_cm >= 0),
  neck_cm numeric check (neck_cm is null or neck_cm >= 0),
  resting_heart_rate int check (resting_heart_rate is null or resting_heart_rate >= 0),
  blood_pressure_systolic int check (blood_pressure_systolic is null or blood_pressure_systolic >= 0),
  blood_pressure_diastolic int check (blood_pressure_diastolic is null or blood_pressure_diastolic >= 0),
  notes text check (char_length(notes) <= 500),
  recorded_by uuid not null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists measurements_user_date_idx on public.body_measurements (user_id, date desc);

alter table public.body_measurements enable row level security;

drop policy if exists "measurements_owner_or_staff_read" on public.body_measurements;
create policy "measurements_owner_or_staff_read"
  on public.body_measurements for select to authenticated
  using (user_id = auth.uid() or public.is_trainer_or_staff());

drop policy if exists "measurements_owner_or_trainer_insert" on public.body_measurements;
create policy "measurements_owner_or_trainer_insert"
  on public.body_measurements for insert to authenticated
  with check (
    (user_id = auth.uid())
    or (public.current_app_role() = 'trainer' and recorded_by = auth.uid())
    or public.is_staff()
  );

drop policy if exists "measurements_owner_or_staff_update" on public.body_measurements;
create policy "measurements_owner_or_staff_update"
  on public.body_measurements for update to authenticated
  using (user_id = auth.uid() or public.is_staff())
  with check (user_id = auth.uid() or public.is_staff());

drop policy if exists "measurements_owner_or_staff_delete" on public.body_measurements;
create policy "measurements_owner_or_staff_delete"
  on public.body_measurements for delete to authenticated
  using (user_id = auth.uid() or public.is_staff());

drop trigger if exists measurements_touch_updated_at on public.body_measurements;
create trigger measurements_touch_updated_at
  before update on public.body_measurements
  for each row execute function public.touch_updated_at();

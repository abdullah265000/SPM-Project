/*
# Workout plans, plan days, and assigned exercises

## Purpose
Trainers (and management/admin) build reusable workout plans that group
exercises into per-day routines and assign those plans to members. This
migration creates four related tables: the plan header, the assignment
junction, the days, and the exercise lines inside each day.

NOTE on ordering: workout_plan_assignments is created BEFORE the
workout_plans SELECT policy, because that policy references the assignments
table in an EXISTS subquery.

## New tables
1. `public.workout_plans` — plan header (created first, without its SELECT policy)
2. `public.workout_plan_assignments` — many-to-many plan ↔ member
3. `public.workout_plan_days` — one row per day in a plan
4. `public.workout_plan_exercises` — exercise lines within a day

Columns and constraints are as described in the project README; see inline
comments for each table.

## Security
- RLS enabled on all four tables.
- Workout plans: members read plans assigned to them; trainers read plans
  they created; staff read all; public templates are readable by everyone.
  Writes (insert/update/delete) are allowed for the owning trainer or staff.
- Assignments: read by the assigned member, the plan's owner trainer, or
  staff. Written (insert/delete) by the plan owner or staff.
- Plan days and plan exercises: read access inherits from the parent plan's
  visibility (via EXISTS on workout_plans). Writes are gated to the plan
  owner or staff, again via EXISTS on workout_plans.created_by.
*/

-- ---------- 1. workout_plans (table + indexes + RLS, SELECT policy added after assignments) ----------
create table if not exists public.workout_plans (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 120),
  description text check (char_length(description) <= 1000),
  created_by uuid not null references public.profiles(id) on delete cascade,
  goal text check (goal in (
    'weight-loss','muscle-gain','strength','endurance',
    'flexibility','rehabilitation','general-fitness'
  )),
  duration_weeks int not null default 4 check (duration_weeks >= 1),
  days_per_week int not null default 3 check (days_per_week between 1 and 7),
  status text not null default 'draft'
    check (status in ('draft','active','paused','completed','archived')),
  start_date timestamptz,
  end_date timestamptz,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists plans_created_by_idx on public.workout_plans (created_by);
create index if not exists plans_status_idx on public.workout_plans (status);
create index if not exists plans_public_idx on public.workout_plans (is_public);

alter table public.workout_plans enable row level security;

-- write policies (read policy added after assignments table exists)
drop policy if exists "plans_trainer_or_staff_insert" on public.workout_plans;
create policy "plans_trainer_or_staff_insert"
  on public.workout_plans for insert to authenticated
  with check (
    (public.current_app_role() = 'trainer' and created_by = auth.uid())
    or public.is_staff()
  );

drop policy if exists "plans_owner_or_staff_update" on public.workout_plans;
create policy "plans_owner_or_staff_update"
  on public.workout_plans for update to authenticated
  using (created_by = auth.uid() or public.is_staff())
  with check (created_by = auth.uid() or public.is_staff());

drop policy if exists "plans_owner_or_staff_delete" on public.workout_plans;
create policy "plans_owner_or_staff_delete"
  on public.workout_plans for delete to authenticated
  using (created_by = auth.uid() or public.is_staff());

drop trigger if exists plans_touch_updated_at on public.workout_plans;
create trigger plans_touch_updated_at
  before update on public.workout_plans
  for each row execute function public.touch_updated_at();

-- ---------- 2. workout_plan_assignments ----------
create table if not exists public.workout_plan_assignments (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.workout_plans(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  unique (plan_id, member_id)
);

create index if not exists assignments_plan_idx on public.workout_plan_assignments (plan_id);
create index if not exists assignments_member_idx on public.workout_plan_assignments (member_id);

alter table public.workout_plan_assignments enable row level security;

-- now the plans SELECT policy can reference assignments safely
drop policy if exists "plans_read" on public.workout_plans;
create policy "plans_read"
  on public.workout_plans for select to authenticated
  using (
    is_public
    or created_by = auth.uid()
    or public.is_staff()
    or exists (
      select 1 from public.workout_plan_assignments a
      where a.plan_id = workout_plans.id and a.member_id = auth.uid()
    )
  );

drop policy if exists "assignments_read" on public.workout_plan_assignments;
create policy "assignments_read"
  on public.workout_plan_assignments for select to authenticated
  using (
    member_id = auth.uid()
    or public.is_staff()
    or exists (
      select 1 from public.workout_plans p
      where p.id = workout_plan_assignments.plan_id and p.created_by = auth.uid()
    )
  );

drop policy if exists "assignments_owner_or_staff_insert" on public.workout_plan_assignments;
create policy "assignments_owner_or_staff_insert"
  on public.workout_plan_assignments for insert to authenticated
  with check (
    exists (
      select 1 from public.workout_plans p
      where p.id = workout_plan_assignments.plan_id
        and (p.created_by = auth.uid() or public.is_staff())
    )
  );

drop policy if exists "assignments_owner_or_staff_delete" on public.workout_plan_assignments;
create policy "assignments_owner_or_staff_delete"
  on public.workout_plan_assignments for delete to authenticated
  using (
    exists (
      select 1 from public.workout_plans p
      where p.id = workout_plan_assignments.plan_id
        and (p.created_by = auth.uid() or public.is_staff())
    )
  );

-- ---------- 3. workout_plan_days ----------
create table if not exists public.workout_plan_days (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.workout_plans(id) on delete cascade,
  day_of_week text not null check (day_of_week in (
    'monday','tuesday','wednesday','thursday','friday','saturday','sunday','custom'
  )),
  label text,
  focus text,
  estimated_duration_min int check (estimated_duration_min is null or estimated_duration_min >= 0),
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists plan_days_plan_idx on public.workout_plan_days (plan_id);
create index if not exists plan_days_position_idx on public.workout_plan_days (plan_id, position);

alter table public.workout_plan_days enable row level security;

drop policy if exists "plan_days_read" on public.workout_plan_days;
create policy "plan_days_read"
  on public.workout_plan_days for select to authenticated
  using (
    exists (
      select 1 from public.workout_plans p
      where p.id = workout_plan_days.plan_id
        and (
          p.is_public
          or p.created_by = auth.uid()
          or public.is_staff()
          or exists (
            select 1 from public.workout_plan_assignments a
            where a.plan_id = p.id and a.member_id = auth.uid()
          )
        )
    )
  );

drop policy if exists "plan_days_owner_or_staff_insert" on public.workout_plan_days;
create policy "plan_days_owner_or_staff_insert"
  on public.workout_plan_days for insert to authenticated
  with check (
    exists (
      select 1 from public.workout_plans p
      where p.id = workout_plan_days.plan_id
        and (p.created_by = auth.uid() or public.is_staff())
    )
  );

drop policy if exists "plan_days_owner_or_staff_update" on public.workout_plan_days;
create policy "plan_days_owner_or_staff_update"
  on public.workout_plan_days for update to authenticated
  using (
    exists (
      select 1 from public.workout_plans p
      where p.id = workout_plan_days.plan_id
        and (p.created_by = auth.uid() or public.is_staff())
    )
  )
  with check (
    exists (
      select 1 from public.workout_plans p
      where p.id = workout_plan_days.plan_id
        and (p.created_by = auth.uid() or public.is_staff())
    )
  );

drop policy if exists "plan_days_owner_or_staff_delete" on public.workout_plan_days;
create policy "plan_days_owner_or_staff_delete"
  on public.workout_plan_days for delete to authenticated
  using (
    exists (
      select 1 from public.workout_plans p
      where p.id = workout_plan_days.plan_id
        and (p.created_by = auth.uid() or public.is_staff())
    )
  );

drop trigger if exists plan_days_touch_updated_at on public.workout_plan_days;
create trigger plan_days_touch_updated_at
  before update on public.workout_plan_days
  for each row execute function public.touch_updated_at();

-- ---------- 4. workout_plan_exercises ----------
create table if not exists public.workout_plan_exercises (
  id uuid primary key default gen_random_uuid(),
  plan_day_id uuid not null references public.workout_plan_days(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  sets int not null check (sets >= 1),
  reps int not null check (reps >= 1),
  weight_kg numeric not null default 0 check (weight_kg >= 0),
  rest_seconds int not null default 60 check (rest_seconds >= 0),
  tempo text,
  notes text check (char_length(notes) <= 300),
  position int not null default 0
);

create index if not exists plan_exercises_day_idx on public.workout_plan_exercises (plan_day_id);
create index if not exists plan_exercises_exercise_idx on public.workout_plan_exercises (exercise_id);
create index if not exists plan_exercises_position_idx
  on public.workout_plan_exercises (plan_day_id, position);

alter table public.workout_plan_exercises enable row level security;

-- helper: the plan that owns a given plan_day
create or replace function public.plan_of_day(day_uuid uuid)
returns uuid
language sql stable
as $$
  select plan_id from public.workout_plan_days where id = day_uuid;
$$;

drop policy if exists "plan_exercises_read" on public.workout_plan_exercises;
create policy "plan_exercises_read"
  on public.workout_plan_exercises for select to authenticated
  using (
    exists (
      select 1 from public.workout_plans p
      where p.id = public.plan_of_day(workout_plan_exercises.plan_day_id)
        and (
          p.is_public
          or p.created_by = auth.uid()
          or public.is_staff()
          or exists (
            select 1 from public.workout_plan_assignments a
            where a.plan_id = p.id and a.member_id = auth.uid()
          )
        )
    )
  );

drop policy if exists "plan_exercises_owner_or_staff_insert" on public.workout_plan_exercises;
create policy "plan_exercises_owner_or_staff_insert"
  on public.workout_plan_exercises for insert to authenticated
  with check (
    exists (
      select 1 from public.workout_plans p
      where p.id = public.plan_of_day(workout_plan_exercises.plan_day_id)
        and (p.created_by = auth.uid() or public.is_staff())
    )
  );

drop policy if exists "plan_exercises_owner_or_staff_update" on public.workout_plan_exercises;
create policy "plan_exercises_owner_or_staff_update"
  on public.workout_plan_exercises for update to authenticated
  using (
    exists (
      select 1 from public.workout_plans p
      where p.id = public.plan_of_day(workout_plan_exercises.plan_day_id)
        and (p.created_by = auth.uid() or public.is_staff())
    )
  )
  with check (
    exists (
      select 1 from public.workout_plans p
      where p.id = public.plan_of_day(workout_plan_exercises.plan_day_id)
        and (p.created_by = auth.uid() or public.is_staff())
    )
  );

drop policy if exists "plan_exercises_owner_or_staff_delete" on public.workout_plan_exercises;
create policy "plan_exercises_owner_or_staff_delete"
  on public.workout_plan_exercises for delete to authenticated
  using (
    exists (
      select 1 from public.workout_plans p
      where p.id = public.plan_of_day(workout_plan_exercises.plan_day_id)
        and (p.created_by = auth.uid() or public.is_staff())
    )
  );

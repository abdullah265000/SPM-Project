/*
# Exercise library and fitness goals

## Purpose
- Build the curated exercise library that trainers/management/admin maintain
  and that members browse when logging workouts.
- Store member-defined fitness goals (weight loss, muscle gain, etc.).

## New tables
1. `public.exercises`
   - `id` (uuid, PK)
   - `name` (text, unique, not null)
   - `category` (text, not null) — strength, cardio, flexibility, balance,
     plyometric, core, olympic-lifting, mobility, rehabilitation
   - `muscle_groups` (text[])
   - `equipment` (text[])
   - `difficulty` (text) — beginner, intermediate, advanced (default beginner)
   - `description` (text)
   - `instructions` (text[])
   - `tips` (text[])
   - `video_url`, `image_url` (text)
   - `default_sets`, `default_reps`, `default_rest_seconds` (int)
   - `created_by` (uuid) → profiles(id) ON DELETE SET NULL
   - `is_active` (boolean, default true)
   - `created_at`, `updated_at` (timestamptz)

2. `public.fitness_goals`
   - `id` (uuid, PK)
   - `user_id` (uuid, not null, default auth.uid()) → profiles(id) ON DELETE CASCADE
   - `title` (text, not null)
   - `type` (text, not null) — weight-loss, muscle-gain, strength, endurance,
     flexibility, rehabilitation, general-fitness
   - `target_value` (numeric)
   - `unit` (text)
   - `start_date` (timestamptz, default now)
   - `target_date` (timestamptz)
   - `status` (text, default active) — active, achieved, abandoned
   - `notes` (text)
   - `created_at`, `updated_at` (timestamptz)

## Security
- RLS enabled on both tables.
- Exercises: all authenticated users can read; only trainer/management/admin
  can insert, update, soft-delete (is_active=false). The custom role helper
  `public.is_trainer_or_staff()` enforces that.
- Fitness goals: owner-scoped CRUD — a user can only see and manage goals
  where `user_id = auth.uid()`. Trainers and staff may read a member's goals
  (needed when building plans for assigned clients) but cannot write them.
  The `user_id` column defaults to `auth.uid()` so inserts that omit it
  still satisfy the WITH CHECK predicate.
*/

-- ---------- exercises ----------
create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null check (category in (
    'strength','cardio','flexibility','balance','plyometric',
    'core','olympic-lifting','mobility','rehabilitation'
  )),
  muscle_groups text[] not null default '{}',
  equipment text[] not null default '{}',
  difficulty text not null default 'beginner'
    check (difficulty in ('beginner','intermediate','advanced')),
  description text,
  instructions text[] not null default '{}',
  tips text[] not null default '{}',
  video_url text,
  image_url text,
  default_sets int check (default_sets is null or default_sets >= 1),
  default_reps int check (default_reps is null or default_reps >= 1),
  default_rest_seconds int check (default_rest_seconds is null or default_rest_seconds >= 0),
  created_by uuid references public.profiles(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists exercises_category_idx on public.exercises (category);
create index if not exists exercises_difficulty_idx on public.exercises (difficulty);
create index if not exists exercises_active_idx on public.exercises (is_active);
create index if not exists exercises_name_trgm_idx on public.exercises
  using gin (name gin_trgm_ops);

alter table public.exercises enable row level security;

drop policy if exists "exercises_read_all" on public.exercises;
create policy "exercises_read_all"
  on public.exercises for select to authenticated
  using (true);

drop policy if exists "exercises_curator_insert" on public.exercises;
create policy "exercises_curator_insert"
  on public.exercises for insert to authenticated
  with check (public.is_trainer_or_staff());

drop policy if exists "exercises_curator_update" on public.exercises;
create policy "exercises_curator_update"
  on public.exercises for update to authenticated
  using (public.is_trainer_or_staff())
  with check (public.is_trainer_or_staff());

drop policy if exists "exercises_curator_delete" on public.exercises;
create policy "exercises_curator_delete"
  on public.exercises for delete to authenticated
  using (public.is_trainer_or_staff());

drop trigger if exists exercises_touch_updated_at on public.exercises;
create trigger exercises_touch_updated_at
  before update on public.exercises
  for each row execute function public.touch_updated_at();

-- ---------- fitness_goals ----------
create table if not exists public.fitness_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 120),
  type text not null check (type in (
    'weight-loss','muscle-gain','strength','endurance',
    'flexibility','rehabilitation','general-fitness'
  )),
  target_value numeric check (target_value is null or target_value >= 0),
  unit text,
  start_date timestamptz not null default now(),
  target_date timestamptz,
  status text not null default 'active'
    check (status in ('active','achieved','abandoned')),
  notes text check (char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists goals_user_idx on public.fitness_goals (user_id);
create index if not exists goals_user_status_idx on public.fitness_goals (user_id, status);

alter table public.fitness_goals enable row level security;

drop policy if exists "goals_owner_or_staff_read" on public.fitness_goals;
create policy "goals_owner_or_staff_read"
  on public.fitness_goals for select to authenticated
  using (
    auth.uid() = user_id
    or public.is_trainer_or_staff()
  );

drop policy if exists "goals_owner_insert" on public.fitness_goals;
create policy "goals_owner_insert"
  on public.fitness_goals for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "goals_owner_update" on public.fitness_goals;
create policy "goals_owner_update"
  on public.fitness_goals for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "goals_owner_delete" on public.fitness_goals;
create policy "goals_owner_delete"
  on public.fitness_goals for delete to authenticated
  using (auth.uid() = user_id);

drop trigger if exists goals_touch_updated_at on public.fitness_goals;
create trigger goals_touch_updated_at
  before update on public.fitness_goals
  for each row execute function public.touch_updated_at();

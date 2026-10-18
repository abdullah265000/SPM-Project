/*
# Foundation: profiles, role helpers, and trainer profiles

## Purpose
This migration lays the foundation for the AU Smart Gym platform. Supabase Auth
manages credentials in `auth.users`; we extend that with a public `profiles`
table holding gym-specific fields (name, role, contact details, assigned trainer)
and a `trainer_profiles` table that holds professional info for users whose role
is `trainer`.

## New tables
1. `public.profiles`
   - `id` (uuid, PK) → references `auth.users(id)`, ON DELETE CASCADE
   - `full_name` (text, not null)
   - `role` (text, not null) — one of: member, trainer, management, admin
   - `phone` (text)
   - `avatar_url` (text)
   - `date_of_birth` (date)
   - `gender` (text) — male, female, other, prefer-not-to-say
   - `street`, `city`, `state_region`, `postal_code`, `country` (text)
   - `is_active` (boolean, default true)
   - `is_email_verified` (boolean, default false)
   - `assigned_trainer_id` (uuid) → self-reference to profiles(id), ON DELETE SET NULL
   - `created_at`, `updated_at` (timestamptz)

2. `public.trainer_profiles`
   - `id` (uuid, PK)
   - `user_id` (uuid, unique, not null) → profiles(id) ON DELETE CASCADE
   - `specialties` (text[])
   - `years_of_experience` (int, default 0)
   - `bio` (text)
   - `hourly_rate` (numeric)
   - `availability_days` (text[])
   - `availability_start` (time)
   - `availability_end` (time)
   - `is_accepting_new_clients` (boolean, default true)
   - `rating` (numeric, 0–5, default 0)
   - `total_reviews` (int, default 0)
   - `created_at`, `updated_at` (timestamptz)

3. `public.certifications` (child of trainer_profiles)
   - `id` (uuid, PK)
   - `trainer_profile_id` (uuid, not null) → trainer_profiles(id) ON DELETE CASCADE
   - `name` (text, not null)
   - `issuer` (text)
   - `issued_date` (date)
   - `expiry_date` (date)
   - `credential_id` (text)

## Helper functions
- `public.current_app_role()` → returns the role from the JWT's app_metadata
  (falls back to 'anon'). Used by RLS policies to gate access by role.
- `public.is_staff()` → true when current role is management or admin.
- `public.is_trainer_or_staff()` → true for trainer, management, admin.

## Security
- RLS enabled on `profiles` and `trainer_profiles` and `certifications`.
- A trigger auto-creates a `profiles` row whenever a new auth.users row is
  inserted, copying `full_name`/`email` from raw_user_meta_data and the `role`
  from raw_app_meta_data (defaulting to 'member').
- Profiles: every authenticated user can read all profiles (needed to look up
  trainers/clients); writes are restricted — a user updates only their own row,
  staff can update any.
- Trainer profiles + certifications: readable by all authenticated users;
  writable only by the profile owner (who must be a trainer) or staff.
*/

-- ---------- helper functions ----------
create or replace function public.current_app_role()
returns text
language sql stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', 'anon');
$$;

create or replace function public.is_staff()
returns boolean
language sql stable
as $$
  select public.current_app_role() in ('management', 'admin');
$$;

create or replace function public.is_trainer_or_staff()
returns boolean
language sql stable
as $$
  select public.current_app_role() in ('trainer', 'management', 'admin');
$$;

-- ---------- profiles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null default 'member' check (role in ('member','trainer','management','admin')),
  phone text,
  avatar_url text,
  date_of_birth date,
  gender text check (gender in ('male','female','other','prefer-not-to-say')),
  street text,
  city text,
  state_region text,
  postal_code text,
  country text default 'Pakistan',
  is_active boolean not null default true,
  is_email_verified boolean not null default false,
  assigned_trainer_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists profiles_active_idx on public.profiles (is_active);
create index if not exists profiles_assigned_trainer_idx on public.profiles (assigned_trainer_id);

alter table public.profiles enable row level security;

drop policy if exists "profiles_read_all" on public.profiles;
create policy "profiles_read_all"
  on public.profiles for select to authenticated
  using (true);

drop policy if exists "profiles_update_own_or_staff" on public.profiles;
create policy "profiles_update_own_or_staff"
  on public.profiles for update to authenticated
  using (auth.uid() = id or public.is_staff())
  with check (auth.uid() = id or public.is_staff());

drop policy if exists "profiles_staff_insert" on public.profiles;
create policy "profiles_staff_insert"
  on public.profiles for insert to authenticated
  with check (public.is_staff());

drop policy if exists "profiles_staff_delete" on public.profiles;
create policy "profiles_staff_delete"
  on public.profiles for delete to authenticated
  using (public.is_staff());

-- ---------- auto-create profile on signup ----------
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- updated_at maintenance ----------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------- trainer_profiles ----------
create table if not exists public.trainer_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  specialties text[] not null default '{}',
  years_of_experience int not null default 0 check (years_of_experience >= 0),
  bio text,
  hourly_rate numeric(10,2) check (hourly_rate >= 0),
  availability_days text[] not null default '{}',
  availability_start time,
  availability_end time,
  is_accepting_new_clients boolean not null default true,
  rating numeric(2,1) not null default 0 check (rating >= 0 and rating <= 5),
  total_reviews int not null default 0 check (total_reviews >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trainer_profiles_user_idx on public.trainer_profiles (user_id);

alter table public.trainer_profiles enable row level security;

drop policy if exists "trainer_profiles_read_all" on public.trainer_profiles;
create policy "trainer_profiles_read_all"
  on public.trainer_profiles for select to authenticated
  using (true);

drop policy if exists "trainer_profiles_owner_or_staff_write" on public.trainer_profiles;
create policy "trainer_profiles_owner_or_staff_write"
  on public.trainer_profiles for insert to authenticated
  with check (auth.uid() = user_id and public.current_app_role() = 'trainer'
              or public.is_staff());

drop policy if exists "trainer_profiles_owner_or_staff_update" on public.trainer_profiles;
create policy "trainer_profiles_owner_or_staff_update"
  on public.trainer_profiles for update to authenticated
  using (auth.uid() = user_id or public.is_staff())
  with check (auth.uid() = user_id or public.is_staff());

drop policy if exists "trainer_profiles_staff_delete" on public.trainer_profiles;
create policy "trainer_profiles_staff_delete"
  on public.trainer_profiles for delete to authenticated
  using (public.is_staff());

drop trigger if exists trainer_profiles_touch_updated_at on public.trainer_profiles;
create trigger trainer_profiles_touch_updated_at
  before update on public.trainer_profiles
  for each row execute function public.touch_updated_at();

-- ---------- certifications ----------
create table if not exists public.certifications (
  id uuid primary key default gen_random_uuid(),
  trainer_profile_id uuid not null references public.trainer_profiles(id) on delete cascade,
  name text not null,
  issuer text,
  issued_date date,
  expiry_date date,
  credential_id text,
  created_at timestamptz not null default now()
);

create index if not exists certifications_trainer_idx on public.certifications (trainer_profile_id);

alter table public.certifications enable row level security;

drop policy if exists "certifications_read_all" on public.certifications;
create policy "certifications_read_all"
  on public.certifications for select to authenticated
  using (true);

drop policy if exists "certifications_owner_or_staff_insert" on public.certifications;
create policy "certifications_owner_or_staff_insert"
  on public.certifications for insert to authenticated
  with check (
    exists (
      select 1 from public.trainer_profiles tp
      where tp.id = certifications.trainer_profile_id
        and (tp.user_id = auth.uid() or public.is_staff())
    )
  );

drop policy if exists "certifications_owner_or_staff_update" on public.certifications;
create policy "certifications_owner_or_staff_update"
  on public.certifications for update to authenticated
  using (
    exists (
      select 1 from public.trainer_profiles tp
      where tp.id = certifications.trainer_profile_id
        and (tp.user_id = auth.uid() or public.is_staff())
    )
  )
  with check (
    exists (
      select 1 from public.trainer_profiles tp
      where tp.id = certifications.trainer_profile_id
        and (tp.user_id = auth.uid() or public.is_staff())
    )
  );

drop policy if exists "certifications_owner_or_staff_delete" on public.certifications;
create policy "certifications_owner_or_staff_delete"
  on public.certifications for delete to authenticated
  using (
    exists (
      select 1 from public.trainer_profiles tp
      where tp.id = certifications.trainer_profile_id
        and (tp.user_id = auth.uid() or public.is_staff())
    )
  );

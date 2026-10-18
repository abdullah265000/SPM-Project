/*
# Set dashboard views to SECURITY INVOKER

## Purpose
The dashboard views created in migration 005 were created with the default
`SECURITY DEFINER` property, which means they run with the view owner's
permissions and BYPASS row-level security. That defeats the per-user
isolation the base-table policies provide. This migration alters the three
views to `SECURITY INVOKER` so queries execute with the calling user's
privileges and RLS applies correctly.

## Changes
- `public.member_dashboard` → SECURITY INVOKER
- `public.member_volume_last_7_days` → SECURITY INVOKER
- `public.trainer_client_overview` → SECURITY INVOKER

## Security
- Views now respect RLS on their underlying tables (profiles, session_logs,
  fitness_goals, workout_plan_assignments, workout_plans).
*/

alter view public.member_dashboard set (security_invoker = true);
alter view public.member_volume_last_7_days set (security_invoker = true);
alter view public.trainer_client_overview set (security_invoker = true);

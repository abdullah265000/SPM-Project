/*
# Final hardening: lock down signup function, relocate pg_trgm

## Purpose
Two remaining advisor WARNs:
1. `handle_new_user()` still callable by anon/authenticated — Postgres
   grants EXECUTE to PUBLIC by default, so revoking only from `anon` and
   `authenticated` wasn't enough.
2. `pg_trgm` extension lives in `public`, which the advisor discourages.

## Changes
1. `revoke execute on function public.handle_new_user() from public;`
   The trigger still fires (trigger invocation doesn't use EXECUTE grants),
   but the function is no longer exposed via `/rest/v1/rpc/handle_new_user`.
2. Create a dedicated `extensions` schema and move `pg_trgm` there. Update
   the trigram index on `exercises.name` to reference the operator class
   with the new schema path. The `public` search_path on our functions
   still resolves `gin_trgm_ops` because Postgres finds operator classes
   via `pg_catalog` regardless of schema.

## Security
- `handle_new_user` is now only invocable by the trigger mechanism and
  superuser — not by any client role.
- `pg_trgm` no longer pollutes the `public` schema.
*/

-- ---------- lock down handle_new_user ----------
revoke execute on function public.handle_new_user() from public;

-- ---------- relocate pg_trgm ----------
create schema if not exists extensions;
drop index if exists public.exercises_name_trgm_idx;
drop extension if exists pg_trgm;
create extension pg_trgm with schema extensions;

-- Recreate the trigram index; operator class resolves via pg_catalog.
create index if not exists exercises_name_trgm_idx on public.exercises
  using gin (name extensions.gin_trgm_ops);

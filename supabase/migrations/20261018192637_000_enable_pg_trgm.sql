/*
# Enable pg_trgm extension

## Purpose
Adds PostgreSQL's trigram extension so we can build GIN trigram indexes for
fast case-insensitive substring search (ILIKE) over exercise names and other
text fields. Required before migration 002.
*/

create extension if not exists pg_trgm;

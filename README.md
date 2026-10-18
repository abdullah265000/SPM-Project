# AU Smart Gym — Workout & Progress Tracking Management System

Backend + data layer for the **AU Smart Gym** platform. The database is **Supabase (PostgreSQL)** with row-level security and role-based access control; an Express.js API layer (Node.js) sits in front for custom business logic. Designed to power a React.js frontend (maintained by Muhammad Umar Farooq) and structured to ship inside an **8-week Agile timeline**.

---

## 1. Tech Stack (open-source)

| Layer            | Technology                                    |
|------------------|-----------------------------------------------|
| Runtime          | Node.js                                       |
| Web framework    | Express.js (custom business logic routes)     |
| Database         | Supabase (PostgreSQL)                         |
| Data access      | `@supabase/supabase-js` + PostgREST           |
| Auth             | Supabase Auth (email/password) + JWT          |
| Access control   | Row-Level Security + role helpers             |
| Validation       | Zod (API layer) + Postgres CHECK constraints  |
| Security         | Helmet, CORS, rate-limit, RLS, pinned search_path |
| Logging          | Morgan                                        |
| Compression      | compression                                   |
| Testing          | Jest + Supertest                              |

---

## 2. Project Structure

```
au-smart-gym-backend/
├── src/
│   ├── server.js                  # Process entry: boots HTTP server
│   ├── app.js                     # Express app (middleware + routes)
│   ├── config/
│   │   ├── env.js                 # Env loading + validation
│   │   ├── db.js                  # Supabase client setup
│   │   └── logger.js
│   ├── controllers/              # Request handlers (business logic)
│   ├── routes/                   # Express routers (one per resource)
│   ├── middleware/
│   │   ├── authMiddleware.js     # Supabase session + role check
│   │   ├── validateMiddleware.js # Zod schemas
│   │   ├── sanitizeMiddleware.js
│   │   └── errorMiddleware.js
│   └── utils/
│       ├── apiResponse.js        # sendSuccess / sendError
│       └── constants.js          # ROLES
├── supabase/migrations/          # SQL migrations (applied via Supabase MCP)
├── .env.example
├── package.json
└── README.md
```

Database schema lives in `supabase/migrations/` as SQL and is applied via the
Supabase migration tool (not Mongoose). The Express layer is optional — the
frontend can talk to PostgREST directly for most CRUD, with Express reserved
for workflows that need server-side logic.

Modularity rules:
- **Routes** only wire HTTP verbs to controllers + middleware.
- **Controllers** hold business logic and call the Supabase client.
- **Migrations** own schema, constraints, triggers, and RLS policies.
- **Utils** are pure helpers (no DB/HTTP coupling).

---

## 3. Roles & Access Control

| Role       | Slug         | Capabilities |
|------------|--------------|--------------|
| Member     | `member`     | Self-register, log workouts, record measurements, set fitness goals, read assigned plans |
| Trainer    | `trainer`    | Build/assign workout plans, view assigned clients, verify session logs, curate exercises |
| Management | `management` | Everything a trainer can do + manage users, assign trainers to members, deactivate accounts |
| Admin      | `admin`      | Full system access, can create elevated accounts |

The role is stored in Supabase Auth's `raw_app_meta_data` (user-immutable) and
read by the SQL helper `public.current_app_role()`. Row-Level Security policies
on every table enforce access at the database level — the frontend cannot
read or write rows it isn't allowed to, regardless of how it calls the API.
Four RLS policies per table (SELECT/INSERT/UPDATE/DELETE) keep the rules tight.

---

## 4. Database Schema (PostgreSQL / Supabase)

The schema is normalized across 13 tables + 3 dashboard views, all with RLS
enabled. Credentials live in Supabase Auth (`auth.users`); everything else is
in `public`. A trigger auto-creates a `profiles` row on signup.

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `profiles` | Extends `auth.users` with gym-specific fields | `id (→auth.users), full_name, role, phone, avatar_url, date_of_birth, gender, address, is_active, assigned_trainer_id` |
| `trainer_profiles` | 1:1 with a trainer's profile | `user_id, specialties[], years_of_experience, bio, hourly_rate, availability_days[], is_accepting_new_clients, rating` |
| `certifications` | Child of trainer_profiles | `trainer_profile_id, name, issuer, issued_date, expiry_date, credential_id` |
| `fitness_goals` | Member-owned targets | `user_id (DEFAULT auth.uid()), title, type, target_value, unit, status` |
| `exercises` | Curated exercise library | `name (unique), category, muscle_groups[], equipment[], difficulty, instructions[], created_by, is_active` |
| `workout_plans` | Trainer-authored plan headers | `title, created_by, goal, duration_weeks, days_per_week, status, is_public` |
| `workout_plan_assignments` | M:N plans ↔ members | `plan_id, member_id, assigned_at` |
| `workout_plan_days` | Days within a plan | `plan_id, day_of_week, label, focus, position` |
| `workout_plan_exercises` | Exercise lines within a day | `plan_day_id, exercise_id, sets, reps, weight_kg, rest_seconds, tempo` |
| `session_logs` | A member's workout for a day | `user_id (DEFAULT auth.uid()), workout_plan_id, date, total_volume_kg, total_sets, is_verified, verified_by` |
| `exercise_logs` | Exercises performed in a session | `session_log_id, exercise_id, exercise_name (snapshot), total_volume_kg` |
| `set_logs` | Individual sets performed | `exercise_log_id, set_number, reps, weight_kg, rpe, completed` |
| `body_measurements` | Body composition over time | `user_id (DEFAULT auth.uid()), date, weight_kg, body_fat_percent, chest/waist/hip/bicep/thigh_cm, recorded_by` |

**Dashboard views** (read-only, `SECURITY INVOKER` so RLS applies):
- `member_dashboard` — lifetime totals per member
- `member_volume_last_7_days` — daily volume for the line chart
- `trainer_client_overview` — per-client 30-day session counts

**Automation:** SQL triggers recompute `exercise_logs.total_volume_kg` and
`session_logs.total_volume_kg` / `total_sets` whenever a `set_logs` row changes,
so aggregates are always correct without app-layer aggregation passes. The
`handle_new_user` trigger creates a `profiles` row on signup, copying the role
from `raw_app_meta_data` (defaulting to `member`).

**RLS pattern:** every table has 4 policies (SELECT/INSERT/UPDATE/DELETE).
Owner columns default to `auth.uid()` so inserts that omit the owner still
satisfy the WITH CHECK predicate. Role helpers (`current_app_role()`,
`is_staff()`, `is_trainer_or_staff()`) gate staff/trainer operations — all
with pinned `search_path = public`.

---

## 5. REST API Endpoints

Base URL: `/api`. All responses: `{ success: boolean, data, meta?, message?, details? }`.

### Auth
| Method | Path              | Auth  | Notes |
|--------|-------------------|-------|-------|
| POST   | `/auth/register`  | public| Members self-register; elevated roles require staff JWT |
| POST   | `/auth/login`     | public| Returns `{ user, token }` |
| GET    | `/auth/me`        | any   | Current user |

### Users
| Method | Path                       | Auth               |
|--------|----------------------------|--------------------|
| PATCH  | `/users/me`                | any                |
| GET    | `/users/me/goals`          | any                |
| POST   | `/users/me/goals`          | any                |
| PATCH  | `/users/me/goals/:id`      | any (owner)        |
| DELETE | `/users/me/goals/:id`      | any (owner)        |
| GET    | `/users`                   | management, admin  |
| GET    | `/users/:id`               | management, admin, trainer |
| PATCH  | `/users/assign-trainer`    | management, admin  |
| PATCH  | `/users/:id/deactivate`    | management, admin  |

### Trainers
| Method | Path                    | Auth      |
|--------|-------------------------|-----------|
| GET    | `/trainers`             | any       |
| GET    | `/trainers/:id`         | any       |
| PATCH  | `/trainers/me/profile`  | trainer   |
| GET    | `/trainers/me/clients`  | trainer   |
| GET    | `/trainers/me/plans`    | trainer   |

### Exercises
| Method | Path                | Auth                                   |
|--------|---------------------|----------------------------------------|
| GET    | `/exercises`        | any (filter: `category, muscleGroups, difficulty, search`) |
| GET    | `/exercises/:id`    | any                                    |
| POST   | `/exercises`        | trainer, management, admin             |
| PATCH  | `/exercises/:id`    | trainer, management, admin             |
| DELETE | `/exercises/:id`    | trainer, management, admin (soft)      |

### Workout Plans
| Method | Path                     | Auth                                      |
|--------|--------------------------|-------------------------------------------|
| GET    | `/workout-plans`         | any (members see assigned; trainers see own) |
| GET    | `/workout-plans/:id`     | any (members: only assigned)              |
| POST   | `/workout-plans`         | trainer, management, admin                |
| PATCH  | `/workout-plans/:id`     | trainer (own), management, admin          |
| POST   | `/workout-plans/:id/assign` | trainer (own), management, admin       |
| DELETE | `/workout-plans/:id`     | trainer (own), management, admin          |

### Session Logs
| Method | Path                          | Auth                                           |
|--------|-------------------------------|------------------------------------------------|
| GET    | `/session-logs`               | any (members: own; staff: filter by `user`)    |
| GET    | `/session-logs/:id`           | any (owner / staff)                            |
| POST   | `/session-logs`               | any (member logs own)                          |
| PATCH  | `/session-logs/:id`           | owner / staff                                  |
| DELETE | `/session-logs/:id`           | owner / staff                                  |
| PATCH  | `/session-logs/:id/verify`    | trainer, management, admin                     |

### Body Measurements
| Method | Path                  | Auth                                                |
|--------|-----------------------|-----------------------------------------------------|
| GET    | `/measurements`       | any (members: own; staff: filter by `user`)         |
| POST   | `/measurements`       | any (member self / staff on behalf of member)       |
| PATCH  | `/measurements/:id`   | owner / staff                                       |
| DELETE | `/measurements/:id`   | owner / staff                                       |

### Dashboards
| Method | Path               | Auth      | Returns |
|--------|--------------------|-----------|---------|
| GET    | `/dashboard/member`| any       | Totals, 7-day volume series, recent sessions, measurements, goals, active plans |
| GET    | `/dashboard/trainer`| trainer+ | Client list, authored plans, client session volume (30 days) |

---

## 6. UI/UX Wireframing — Frontend Component Structure

The React frontend (Muhammad Umar Farooq) should mirror the API's resource boundaries. Proposed component tree:

```
src/
├── components/
│   ├── layout/
│   │   ├── AppShell.jsx          # Sidebar + topbar wrapper
│   │   ├── Sidebar.jsx           # Role-aware nav
│   │   └── Topbar.jsx            # Profile dropdown, notifications
│   ├── common/
│   │   ├── Button.jsx
│   │   ├── Card.jsx
│   │   ├── Modal.jsx
│   │   ├── Input.jsx
│   │   ├── Select.jsx
│   │   ├── DataTable.jsx
│   │   ├── EmptyState.jsx
│   │   ├── Spinner.jsx
│   │   └── ErrorBoundary.jsx
│   ├── charts/
│   │   ├── VolumeOverTimeChart.jsx   # Line chart (recharts)
│   │   ├── BodyCompositionChart.jsx  # Multi-line (weight, BF%, muscle)
│   │   ├── SessionFrequencyChart.jsx # Bar chart
│   │   └── ProgressRing.jsx          # Goal completion
│   └── workouts/
│       ├── ExercisePicker.jsx
│       ├── SetLogger.jsx             # Editable sets/reps/weight grid
│       ├── PlanDayCard.jsx
│       └── WorkoutSummary.jsx
├── features/
│   ├── auth/
│   │   ├── LoginPage.jsx
│   │   ├── RegisterPage.jsx
│   │   └── useAuth.js               # Hook: login, logout, current user
│   ├── dashboard/
│   │   ├── MemberDashboard.jsx      # Stats grid + charts
│   │   ├── TrainerDashboard.jsx     # Client overview + plan shortcuts
│   │   └── StatCard.jsx
│   ├── workouts/
│   │   ├── PlanListPage.jsx
│   │   ├── PlanDetailPage.jsx       # Calendar view of days
│   │   ├── PlanEditorPage.jsx       # Trainer-only: build/assign
│   │   ├── SessionLogPage.jsx       # Member: log today's workout
│   │   └── SessionHistoryPage.jsx
│   ├── measurements/
│   │   ├── MeasurementForm.jsx
│   │   └── MeasurementHistoryPage.jsx
│   ├── exercises/
│   │   ├── ExerciseLibraryPage.jsx
│   │   └── ExerciseDetailDrawer.jsx
│   ├── goals/
│   │   └── GoalsPanel.jsx
│   └── admin/
│       ├── UserListPage.jsx
│       └── AssignTrainerModal.jsx
├── routes/
│   ├── ProtectedRoute.jsx          # Auth guard + role check
│   └── index.jsx                   # react-router config
├── services/
│   ├── apiClient.js                # Axios instance w/ JWT interceptor
│   ├── authService.js
│   ├── workoutService.js
│   └── ...
└── store/                          # (optional) Zustand or Redux Toolkit
```

### Design principles
1. **Single Responsibility per view** — list, detail, edit, and log live on separate screens.
2. **Progressive disclosure** — secondary actions (assign trainer, edit exercise) appear in modals/drawers, not inline.
3. **Role-aware navigation** — the Sidebar renders only the sections a role can access; `ProtectedRoute` enforces the same server-side.
4. **Consistent design system** — 8px spacing grid, 6 color ramps (primary/secondary/accent/success/warning/error), max 3 font weights.
5. **Visual feedback** — loading spinners, optimistic updates on set logging, toast notifications for save/error, hover/transition micro-interactions.
6. **Data visualization** — Recharts for the dashboard: line chart for volume over time, multi-line for body composition, bar for session frequency, progress ring for goals.
7. **Empty states** — every list page shows a helpful empty state with a primary CTA (e.g. "Log your first workout").

### Key wireframes (text)

**Member Dashboard**
```
┌─────────────────────────────────────────────────────────┐
│ Topbar:  AU Smart Gym            🔔  👤 John (Member)   │
├──────────┬──────────────────────────────────────────────┤
│ Sidebar  │  Welcome back, John                           │
│ Dashboard│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐         │
│ Workouts │  │ 24   │ │1,240 │ │ 8h   │ │ 3    │         │
│ History  │  │Sessns│ │Volume│ │Time  │ │Goals │         │
│ Measure  │  └──────┘ └──────┘ └──────┘ └──────┘         │
│ Exercises│  Volume — last 7 days                          │
│ Goals    │  ┌──────────────────────────────┐             │
│          │  │     ╱╲    ╱╲                  │             │
│          │  │   ╱   ╲  ╱  ╲    ╱            │             │
│          │  │ ╱       ╲    ╲ ╱              │             │
│          │  └──────────────────────────────┘             │
│          │  Active Plan: Push/Pull/Legs (4 wks)           │
│          │  Recent Sessions            Body Composition   │
│          │  • Leg Day — 2d ago         weight ──┐         │
│          │  • Push Day — 4d ago           │     └──       │
└──────────┴──────────────────────────────────────────────┘
```

**Session Log (member)**
```
┌────────────────────────────────────────────┐
│  Log Workout — Today, 18 Oct 2026          │
│  Plan: Push/Pull/Legs  •  Day: Push        │
├────────────────────────────────────────────┤
│  Bench Press                       ▾ change │
│  ┌─────┬─────┬──────┬──────┬─────┐          │
│  │ Set │ Reps│Weight│ RPE  │ ✓   │          │
│  ├─────┼─────┼──────┼──────┼─────┤          │
│  │  1  │  8  │ 60   │  7   │  ✓  │          │
│  │  2  │  8  │ 60   │  7.5 │  ✓  │          │
│  │  3  │  6  │ 62.5 │  9   │  ✓  │          │
│  └─────┴─────┴──────┴──────┴─────┘          │
│  + Add exercise   ▌ Notes                 │
│                            [ Save Session ] │
└────────────────────────────────────────────┘
```

**Trainer Dashboard**
```
┌──────────────────────────────────────────────┐
│  Your Clients (12)        Your Plans (8)      │
│  ┌────────────────────┐   ┌────────────────┐  │
│  │ John  • 8 sessions │   │ Push/Pull/Legs │  │
│  │ Sara  • 5 sessions │   │ Full Body A/B  │  │
│  │ Ali   • 3 sessions │   │ + New plan     │  │
│  └────────────────────┘   └────────────────┘  │
│  Client volume — last 30 days (bar chart)      │
└──────────────────────────────────────────────┘
```

---

## 7. 8-Week Agile Development Plan

Two-week sprints. Backend (this repo) and frontend (Umar) run in parallel, integrating at end of each sprint.

### Sprint 0 — Setup & Foundations (Week 0–1)
- Repo init, CI, env config, lint, commit conventions
- Database: Supabase project provisioned, baseline migrations applied (profiles, roles, helpers)
- Frontend skeleton: Vite + React, routing, auth shell, Supabase client, design tokens
- **Deliverable:** Health check passes, Supabase Auth wired, login screen works

### Sprint 1 — Auth & User Management (Week 1–2)
- Database: profiles trigger, RLS policies, role helpers in place
- Frontend: login/register pages, protected routes, role-aware sidebar, Supabase session management
- **Deliverable:** A user of each role can sign in and land on a role-correct dashboard shell

### Sprint 2 — Exercise Library & Trainer Profiles (Week 3–4)
- Database: exercises + trainer_profiles + certifications tables with RLS
- Frontend: Exercise library (search/filter via PostgREST), trainer profile editor
- **Deliverable:** Trainers can curate exercises and update their profile

### Sprint 3 — Workout Plans (Week 4–5)
- Database: workout_plans + assignments + days + plan_exercises tables with RLS
- Frontend: Plan editor (drag days/exercises), plan list, plan detail (calendar view)
- **Deliverable:** Trainer builds a plan, assigns members, member sees it on dashboard

### Sprint 4 — Session Logging & Measurements (Week 5–6)
- Database: session_logs + exercise_logs + set_logs + body_measurements with RLS + aggregation triggers
- Frontend: Set logger grid, session history, measurement form + history with charts
- **Deliverable:** Member logs a full workout + records measurements; trainer verifies

### Sprint 5 — Dashboards & Analytics (Week 6–7)
- Database: member_dashboard, member_volume_last_7_days, trainer_client_overview views (SECURITY INVOKER)
- Frontend: Member dashboard (volume, body comp, goals), trainer dashboard (client overview)
- **Deliverable:** Role-specific dashboards render live data with charts

### Sprint 6 — Hardening & Testing (Week 7–8)
- Database: run Supabase security advisor, fix findings (pinned search_path, SECURITY INVOKER views, revoked EXECUTE)
- Frontend: E2E (Cypress/Playwright) for auth + log workout flow, error boundaries, empty states
- Cross-cutting: pagination, search, audit logs, notification toasts
- **Deliverable:** Advisor clean; demo-ready; deploy to staging

### Sprint 7 — UAT, Polish & Production Deploy (Week 8)
- UAT with real trainer/member scenarios
- Bug bash, perf check (indexes verified via `explain`)
- Production deploy (Supabase for DB/auth + Vercel for frontend)
- Hand-off docs + post-launch monitoring

---

## 8. Getting Started

The Supabase project is already provisioned — credentials are in `.env`.

```bash
# 1. Install dependencies
npm install

# 2. Run the Express layer in development (auto-restart)
npm run dev

# 3. Run tests
npm test
```

Server starts on `http://localhost:5000`. Health check: `GET /health`.

The database schema is already applied via Supabase migrations. To inspect it,
open the Supabase dashboard → Table Editor, or query `pg_tables` in the SQL
editor. Migrations are listed under Database → Migrations.

---

## 9. Integration Contract for the Frontend

The frontend can talk to Supabase two ways:

**A. Direct via PostgREST** (preferred for standard CRUD)
- Use `@supabase/supabase-js` — env vars `SUPABASE_URL` + `SUPABASE_ANON_KEY`
- All tables and views are exposed under `/rest/v1/<table>`
- RLS enforces access automatically; no manual filtering by role needed
- Owner columns default to `auth.uid()`, so inserts can omit `user_id`
- Use `.maybeSingle()` for zero-or-one queries, `.single()` only when a row is required
- Pagination: `?range=0-19` (or `.range(0,19)`)

**B. Via the Express API** (for workflows needing server-side logic)
- Base URL: `${API_BASE}/api`
- Attach `Authorization: Bearer <token>` on every request
- Every response is `{ success, data, meta?, message?, details? }`
- On `401`, clear session and redirect to `/login`; on `403`, show a toast

**Auth flow**
- `supabase.auth.signUp({ email, password, options: { data: { full_name }, } })`
- The `role` is set in `raw_app_meta_data` by an admin/management user via the
  Supabase Admin API (members self-register as `member` by default)
- `supabase.auth.signInWithPassword({ email, password })`
- Wrap async work in `onAuthStateChange` inside an IIFE to avoid deadlocks

---

## 10. Security Notes

- Credentials managed by Supabase Auth (bcrypt-hashed in `auth.users`); passwords never reach the app layer.
- Row-Level Security is enabled on every table — the frontend cannot read or write rows it isn't allowed to, regardless of how it calls the API.
- Four policies per table (SELECT/INSERT/UPDATE/DELETE); owner columns default to `auth.uid()` so omitted-owner inserts still pass the WITH CHECK predicate.
- Role stored in `raw_app_meta_data` (user-immutable), read by `current_app_role()` — never in user-editable metadata.
- All RLS helper functions have `search_path = public` pinned (no search-path shadowing attacks).
- Dashboard views are `SECURITY INVOKER` so they respect RLS instead of bypassing it.
- `handle_new_user` is SECURITY DEFINER but EXECUTE revoked from all client roles — only the trigger can fire it.
- `pg_trgm` extension lives in a dedicated `extensions` schema, not `public`.
- Soft delete on Exercise (`is_active=false`) preserves historical session log integrity.
- Session logs denormalize the exercise name so editing the library cannot rewrite history.
- Helmet sets secure HTTP headers; CORS is pinned to the client URL; rate limiting on `/api`.

---

_AU Smart Gym — backend built for collaboration with Muhammad Umar Farooq (frontend & deployment)._

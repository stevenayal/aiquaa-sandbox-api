# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

A Next.js (App Router, TypeScript strict) sandbox REST API for students in a Software Test
Automation course. It backs onto an isolated `qa_training` schema inside a **real, shared
Supabase Postgres project** (`hocryhxndegslzfiwlnx`, "aiquaa-test-management") — that project
also hosts unrelated production data outside `qa_training`, so changes to roles/grants/RLS
must stay scoped to `qa_training` and never touch `public` or other schemas.

Three independent surfaces exist side by side and must stay that way — don't merge or replace one with the other:

1. **Raw-SQL sandbox** (`/api/v1/sql/select`, `/api/v1/sql/update`, plus their `/api/v2/sql/*`
   twins) — students submit SQL directly; the server validates the AST before executing.
2. **Fixed REST endpoints by course group** (`/api/v1/auth/login`, `/api/v1/transferencias`,
   etc.) — 29 routes with SQL fixed at code-authoring time, for BDD/Gherkin test automation
   practice. See the route→group table in `README.md`.
3. **Performance suite** (`/api/perf/**`) — surface designed to be load-tested, plus the
   Grafana/JMeter material for a talk on performance and monitoring. Lives outside both
   cohorts (no `curso`), has its own OpenAPI spec and its own docs tab. See `perf/README.md`.

### Two cohorts, two schemas — `/api/v1` (curso 1) and `/api/v2` (curso 2)

One deploy serves two courses whose data must never mix. Curso 1 (10 groups) lives in
`qa_training`; curso 2 "Productos Bancarios" (5 groups: cuentas, tarjetas, préstamos,
transferencias/pagos, ahorros/depósitos) lives in `qa_training_v2`, created by
`scripts/setup-db-v2.sql` + `scripts/seed-data-v2.sql`. Three resource names (cuentas,
tarjetas, transferencias) exist in both — the separation is what keeps one cohort's
soft-deletes from breaking the other's tests. Rules:

- **The isolation is the schema, not a `WHERE`.** `/api/v2/**` routes use `getQaApiV2Pool()`
  (and `getQaReaderV2Pool()`/`getQaWriterV2Pool()` for the sandbox), which reuse the *same*
  roles and connection strings as v1 and differ only in `search_path`. Don't add a `curso`
  column to the v1 tables, and don't point a v2 route at a v1 pool.
- **The curso gate is symmetric: every `/api/v1` route passes `curso: 1` and every `/api/v2`
  route passes `curso: 2`** to `apiRoute()`/`handleSqlRequest()` — a key from the other cohort
  gets `403 FORBIDDEN` (`public.api_keys.curso`, default 1). The only route without `curso` is
  `GET /api/v1/roster`, which the frontend calls to discover a student's curso. New routes must
  declare their curso; omitting it silently opens the route to both cohorts (it happened in
  production: a curso 2 key created a transfer in `/api/v1` before the gate was symmetric).
- **v2 pools use custom type parsers (`v2TypeParsers` in `lib/db.ts`)**: `bigint` → number and
  `date` → `"YYYY-MM-DD"` text, to match `lib/openapi-v2.ts`. `numeric` stays a string. v1 pools
  keep node-postgres defaults on purpose (curso 1 already has tests written against them).
- **Never reuse one `$n` placeholder in two type contexts in the same statement** (e.g. as a
  `bigint` column value *and* inside `'...' || $1`), and cast `$n` explicitly next to integer
  literals (`$1::numeric * 1`, not `$1 * 1`, which makes Postgres infer `integer` and reject
  cents). Both shipped to production in v2 and failed as "inconsistent types deduced for
  parameter" / "invalid input syntax for type integer". Verifying SQL with literal values
  (e.g. via the Supabase MCP) does **not** catch this — only real parameter binding does.
- `lib/sql-validator.ts` keeps **two** table whitelists (`QA_TRAINING_TABLES`,
  `QA_TRAINING_V2_TABLES`); adding a table to either schema means adding it there too.
- v2 has its own OpenAPI spec (`lib/openapi-v2.ts` → `/api/v2/docs`, rendered at `/docs/v2`)
  and its own Postman collection (`postman_collection_v2.json`). Don't merge them into the v1
  files — each cohort's sidebar should show only its own routes.

## Commands

```bash
npm run dev          # start dev server
npm run build         # production build (also the TypeScript check — build fails on TS errors)
npm run lint           # eslint
npm test                # vitest run (all tests once)
npm run test:watch      # vitest watch mode
npx vitest run lib/foo.test.ts   # run a single test file
npm run db:setup        # psql "$DATABASE_URL_ADMIN" -f scripts/setup-db.sql
npm run db:seed         # psql "$DATABASE_URL_ADMIN" -f scripts/seed-data.sql
npm run db:seed:perf         # 100k filas en qa_training.perf_carga (aparte de db:seed)
npm run db:setup:monitoring  # rol qa_monitor + vista public.v_api_metrics (Grafana)
```

There is no separate `tsc` script — `npm run build` is the type-check gate. Always run
`lint`, `test`, and `build` before considering a change done.

## Architecture

### Two request pipelines, same shape

Both surfaces funnel through a shared "auth → rate-limit → validate → execute → audit"
pipeline, but via two different generic wrappers — don't add a third:

- **`lib/handle-sql-request.ts`** (`handleSqlRequest`) — used by the two `/sql/*` routes. Takes
  a `getPool: () => Pool` **getter**, not a resolved `Pool`, so the pool (and the env vars it
  needs) is only touched after auth/rate-limit/validation pass, not just because the route was
  hit. Validates the submitted SQL via `lib/sql-validator.ts` before ever running it.
- **`lib/api-route.ts`** (`apiRoute()`) — used by all 29 REST routes under `app/api/v1/**`
  (excluding `sql/`). Each route passes a Zod `inputSchema` and a `handler`; `apiRoute` merges
  `{...query, ...body, ...pathParams}` (path params win on name collision) into one object
  before validating. `inputSchema` is typed `ZodType<TInput, ZodTypeDef, any>` — only the
  *output* type is constrained, because query schemas using `.transform()` (e.g.
  `z.enum(["true","false"]).transform(v => v === "true")` for boolean query params) have a
  different input type than output type. Handlers return `{ status?, body }`; use the
  `notFound(message)` helper for 404s instead of throwing.

Every route file under `app/api/v1/**` has `export const runtime = "nodejs"` — `pg` and
`node-sql-parser` do not run under the Edge runtime.

`apiRoute` also takes two optional knobs, both used only by `/api/perf/**`:
`rateLimit` (a `RateLimitConfig`; omitted = the shared 30/min) and `auditSampleRate`.
`RouteContext` carries `headers` (the raw request `Headers` — needed for `Idempotency-Key`,
which is protocol metadata, not a parameter) and `grupo` (set only when the subject
authenticated with a group JWT). `ApiRouteResult` takes an optional `headers` map; if the
body is a string *and* a `content-type` is declared there, the response is sent as-is instead
of through `NextResponse.json` (only `/api/perf/metrics?format=prometheus` does this).

### Two ways to authenticate — `x-api-key` and `Authorization: Bearer`

`lib/auth.ts` accepts either, with **`x-api-key` taking precedence** so nothing students
already wrote changes behavior. The Bearer path verifies a group JWT (`lib/jwt.ts`, HS256 via
`jose`, 1 h, `JWT_SECRET` required in `lib/env.ts`) and **never touches the database** — the
signature already proves we minted it, and `curso`/`grupo` travel inside the token.

Two consequences that are easy to get wrong:

- **`apiKeyId` is no longer always a UUID.** On the Bearer path it is `jwt:<username>`.
  `public.sql_audit_log.api_key_id` is `uuid REFERENCES public.api_keys(id)`, so writing that
  there violates the FK — and because `logAudit` swallows errors, it would silently mean
  *zero* audit rows for all JWT traffic. `splitSubject()` in `lib/audit-log.ts` tests the UUID
  shape and routes anything else to the `subject` column with `api_key_id = NULL`.
- **Tokens are group-scoped but nothing enforces a group gate on the course routes.** The
  `grupo` claim is carried through to `RouteContext` and is currently unused; only the token
  endpoint itself checks it (403 when a credential from another group hits its URL).

The 15 token endpoints (`app/api/v{1,2}/g{n}/auth/token/route.ts`) are 4 lines each and all
delegate to `groupTokenRoute()` in `lib/group-token-route.ts`, so they can't diverge. Group
names and seeded usernames live in `lib/course-groups.ts`; the passwords are seeded in
`scripts/seed-data*.sql` and published in `README.md` (fake data in a sandbox).

Password verification happens **inside Postgres** (`password_hash = extensions.crypt($2,
password_hash)`, bcrypt via `pgcrypto`) — the cleartext never leaves the bound parameter.
`extensions.` must be spelled out: the pools' `search_path` is only `qa_training`.

**`qa_training.credenciales`, `qa_training_v2.credenciales`, `perf_carga` and
`perf_idempotencia` are deliberately absent from the whitelists in `lib/sql-validator.ts`** —
that omission is what stops a student from `SELECT`ing the password hashes through
`/sql/select`. `setup-db.sql` also revokes `credenciales` from `qa_reader`/`qa_writer` as
defense in depth. Don't "fix" this by adding them to the lists.

### Postgres roles: four, each with a distinct purpose

Defined in `scripts/setup-db.sql`, one dedicated `pg.Pool` singleton per role in `lib/db.ts`
(`getQaReaderPool`, `getQaWriterPool`, `getQaApiPool`, `getMetaPool`). **Never widen a role's
grants to cover another role's job** — the separation is deliberate:

- `qa_reader` — SELECT only. Backs `/api/v1/sql/select`.
- `qa_writer` — UPDATE only (plus SELECT — see gotcha below). Backs `/api/v1/sql/update`.
  Statements always require `WHERE`, enforced by `lib/sql-validator.ts`, not by the DB role.
- `qa_api` — SELECT+INSERT+UPDATE, **no DELETE**. Used *exclusively* by the fixed-SQL REST
  routes (`app/api/v1/**` and `app/api/v2/**`, except `sql/`). Routes that logically "delete"
  (e.g. revoking a role) do a soft-delete `UPDATE ... SET activo = false` instead.
- `app_meta` — internal bookkeeping only (`public.api_keys`, `public.sql_audit_log`).

Postgres gotchas already hit and fixed here — don't reintroduce them:
- An UPDATE/INSERT-capable role also needs a SELECT-type (or `FOR ALL`) RLS policy, not just an
  UPDATE/INSERT-type one — Postgres needs to "see" the row via SELECT to resolve
  WHERE/RETURNING, even for INSERT with RETURNING.
- INSERT into a `bigserial` PK needs `GRANT USAGE, SELECT` on the sequence, separate from the
  table-level INSERT grant — easy to forget, fails as "permission denied for sequence".
- To verify a role actually works against production, connect **directly** with `pg.Pool` using
  that role's own credentials — the Supabase MCP's `execute_sql` runs as its own service role
  and can't `SET ROLE` to test another role's permissions (it errors with "permission denied to
  set role"). Without those credentials at hand, the next best check is catalog-level:
  `has_table_privilege('qa_api', ...)`, `has_sequence_privilege(...)` and a `pg_policies` count
  per schema.
- When copying the RLS bootstrap loop from `setup-db.sql` to a new schema, remember it filters
  on `schemaname = 'qa_training'` — leaving that literal in place enables RLS on the new tables
  with **no** policies, and every role sees zero rows despite correct GRANTs.

### Supabase pooler connection strings (see `.env.example` for the full writeup)

- Always use the **transaction pooler** (port 6543), never the direct host — this project's
  direct host is IPv6-only and Vercel serverless has no IPv6 egress.
- Pooler host cluster number is project-specific (`aws-1-us-east-1` here, not `aws-0`).
- Pooler username requires the `<role>.<project-ref>` suffix.
- Never add `?sslmode=require` — it overrides `lib/db.ts`'s `ssl: { rejectUnauthorized: false }`
  and breaks with a self-signed-cert error against Supabase's pooler. `lib/db.ts` strips it
  defensively (`stripSslMode`) if it slips into an env var anyway.
- Each pool sets `search_path` via the connection-string `options` startup parameter (not a
  runtime `SET`), required for pgbouncer transaction-mode compatibility.

### Other shared modules

- `lib/env.ts` — Zod-validated, memoized `process.env` access (`getEnv()`). Add new required
  env vars here, not as scattered `process.env.X` reads.
- `lib/errors.ts` — `ApiErrorCode` union + `errorResponse()`/`rateLimitResponse()`. Add new
  error codes here and to `STATUS_BY_CODE`.
- `lib/sql-validator.ts` — AST-based whitelist (`node-sql-parser`) for the raw-SQL sandbox:
  single statement, only `qa_training` tables (`QA_TRAINING_TABLES`), correct statement type,
  WHERE required for UPDATE, placeholder count matches params. When a table is added to
  `qa_training`, add it to `QA_TRAINING_TABLES` too.
- `lib/openapi.ts` / `lib/openapi-v2.ts` / `lib/openapi-perf.ts` — hand-authored OpenAPI 3.1 specs (no zod-to-openapi
  generator), served by `app/api/v1/docs` / `app/api/v2/docs` and rendered at `/docs` and
  `/docs/v2` via Scalar loaded from a CDN `<script>` (not the `@scalar/api-reference-react`
  package — its bundled CSS didn't survive Turbopack, see `app/docs/route.ts`). Every new route
  needs a matching `paths` entry in its cohort's spec. The two docs pages share
  `lib/docs-page.ts`; Scalar's own multi-spec selector (`data-configuration` with `sources`) was
  tried first and the CDN build in use (1.67.0) never leaves the loading skeleton with it.
- `lib/rate-limit.ts` — Upstash Redis sliding window, keyed by `apiKeyId` (not IP, since
  students may share a classroom network). The limit is **per route**: `checkRateLimit(id,
  cfg)` takes a `RateLimitConfig { requests, windowSeconds, bucket }`, defaulting to
  `DEFAULT_RATE_LIMIT` (30/60s). **Every distinct config needs its own `bucket`** — the Redis
  prefix is `aiquaa-sandbox:${bucket}`, and two limits sharing a bucket share the keys, so the
  permissive route drains the strict route's window. The 429 message is built by
  `rateLimitMessage(cfg)`; never hardcode "30 requests per minute" again. Successful responses
  now carry `X-RateLimit-*` too (`setRateLimitHeaders` in `lib/errors.ts`); `X-RateLimit-Reset`
  is Unix **milliseconds**, which is what Upstash returns.
- `lib/audit-log.ts` — writes every request (success or failure) to `public.sql_audit_log`;
  never throws (a logging failure must not turn a 200 into a 500), and is always `await`ed
  rather than fire-and-forget since a Vercel function can freeze right after the response.
  Beyond the original columns it records `duration_ms`, `status_code`, `method`, `route` (the
  normalized template — `normalizeRoute()` turns `/api/v1/cuentas/42` into
  `/api/v1/cuentas/{id}`, otherwise every id is its own series in Grafana) and `subject`.
  401/403/429 are now logged too, sampled. `logAudit(entry, { sampleRate })` applies the
  sample to **every** entry, not just successes — during a load run the 429s are as numerous
  as the 200s. Only `/api/perf/**` passes a sample rate.

### Adding a new REST route under `app/api/v1/`

(For `app/api/v2/`, the same steps apply with `getQaApiV2Pool()`, `curso: 2` in `apiRoute`,
and `lib/openapi-v2.ts`.)

1. Zod schema(s) for GET query / POST-PATCH body — reuse the enum+transform pattern for boolean
   query params (`z.coerce.boolean()` incorrectly treats `"false"` as truthy).
2. `export const GET/POST/PATCH/DELETE = apiRoute({ inputSchema, handler })`.
3. Multi-statement writes that must be atomic use `withTransaction(getQaApiPool(), async (client) => ...)`
   from `lib/db.ts` (see `app/api/v1/ordenes/route.ts` and `app/api/v1/facturas/[id]/pagar/route.ts`
   for the pattern, including `SELECT ... FOR UPDATE` to prevent double-processing).
4. Add the corresponding `paths` entry to `lib/openapi.ts` and a row to the route table in
   `README.md`.

### Testing

Vitest, `lib/**/*.test.ts` only (see `vitest.config.ts`). Route handlers aren't tested directly;
instead the shared pipelines (`lib/auth.ts`, `lib/api-route.ts`, `lib/sql-validator.ts`) take an
injectable `pool` parameter or have their real dependencies mocked with `vi.mock` (see
`lib/api-route.test.ts`, which mocks `./auth`, `./rate-limit`, `./audit-log`), so tests don't
hit the module-level `Pool` singletons in `lib/db.ts` or need real credentials.

## The performance suite (`/api/perf/**`) and monitoring

Built for a live talk on performance and monitoring. `perf/README.md` has the setup,
`perf/README-charla.md` maps each talking point to a runnable demo.

- Routes are under `app/api/perf/**`, declare **no `curso`** (any valid key from either
  cohort works — the `/api/v1/roster` precedent), use `getQaApiPool()`, and have their own
  spec (`lib/openapi-perf.ts` → `/api/perf/docs`, rendered at `/docs/perf`, third entry in
  `TABS` in `lib/docs-page.ts`).
- Per-route limits and the sample rates live in `lib/perf-config.ts`, along with
  `SYSTEM_LIMITS` — ceilings measured against the live instance, served by
  `GET /api/perf/limits`. **If the instance is resized, those numbers become lies**; re-run
  the `pg_settings` query in the file's comment.
- `/api/perf/echo` and `/api/perf/echo-limited` must stay byte-identical in behavior (they
  share `perfEchoRoute()`); the whole point is that the *only* difference is the limit.
- `?mode=literal` on `/api/perf/db` concatenates the filter value into the SQL **on purpose**
  — it's the hard-parse demo, and each distinct literal creates a new `pg_stat_statements`
  entry. The value is a server-generated integer, never client input, so there's no injection
  surface. It does cause eviction in `pg_stat_statements` for the whole (shared) instance;
  `SELECT extensions.pg_stat_statements_reset()` afterwards.
- Load-test tables (`perf_carga`, `perf_idempotencia`) are dedicated so a run never blocks
  course data. `perf_carga.codigo` is deliberately **unindexed** — it's the slow side of
  `?indexed=false`.

### Facts about this instance that shape the whole design

Measured 2026-09-22 against `hocryhxndegslzfiwlnx` (Postgres 17.6):

- **`max_connections = 60`**, and it is a *global* resource shared with unrelated production
  data outside `qa_training`. This — not CPU — is the system's real ceiling, and an
  aggressive load run can starve the rest of the project.
- `shared_buffers` 224 MB, `work_mem` 2.1 MB, `plan_cache_mode = auto`.
- `pg_stat_statements` is installed (schema `extensions`), but **`track_planning` is `off`**,
  so `total_plan_time` is always 0. The hard-parse demo therefore graphs the *count* of
  entries, not planning time.
- The transaction pooler (port 6543, mandatory because the direct host is IPv6-only) **cannot
  hold named prepared statements**, so every `pool.query` is re-parsed and re-planned
  server-side even though all the SQL is correctly parameterized. That's this repo's own
  instance of the problem the talk describes.

### Monitoring

`scripts/setup-monitoring.sql` creates a read-only `qa_monitor` role (`CONNECTION LIMIT 3` —
those 60 connections are shared) and `public.v_api_metrics`, a view that joins
`sql_audit_log` with `api_keys` to expose the label and curso **without granting access to
`api_keys`**, which stores keys in plaintext. The view works for `qa_monitor` only because it
is not `security_invoker` and its owner bypasses RLS on `sql_audit_log`; turning on FORCE ROW
LEVEL SECURITY there would silently empty the dashboards.

Grafana Cloud consumes two sources: a Postgres datasource for `pg_stat_statements` and
`pg_stat_activity` (point-in-time, no history of their own), and Prometheus via Grafana Alloy
for everything that needs a time series. Dashboards are versioned in `perf/grafana/`.

**Vercel serverless has no CPU/memory to scrape** — no pod, no cgroup, and function metrics
require a Pro plan. So there are two complementary views: `perf/docker-compose.yml` runs the
app locally with explicit `cpus`/`memory` limits and cAdvisor (real numbers, and the k8s
sizing story), while `/api/perf/metrics` self-reports `process.memoryUsage()`/`cpuUsage()`
per lambda `instance_id` from the real deploy. Those per-instance numbers must never be
summed across instances.

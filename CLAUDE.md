# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

A Next.js (App Router, TypeScript strict) sandbox REST API for students in a Software Test
Automation course. It backs onto an isolated `qa_training` schema inside a **real, shared
Supabase Postgres project** (`hocryhxndegslzfiwlnx`, "aiquaa-test-management") — that project
also hosts unrelated production data outside `qa_training`, so changes to roles/grants/RLS
must stay scoped to `qa_training` and never touch `public` or other schemas.

Two independent surfaces exist side by side and must stay that way — don't merge or replace one with the other:

1. **Raw-SQL sandbox** (`/api/v1/sql/select`, `/api/v1/sql/update`) — students submit SQL
   directly; the server validates the AST before executing.
2. **Fixed REST endpoints by course group** (`/api/v1/auth/login`, `/api/v1/transferencias`,
   etc.) — 29 routes with SQL fixed at code-authoring time, for BDD/Gherkin test automation
   practice. See the route→group table in `README.md`.

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

### Postgres roles: four, each with a distinct purpose

Defined in `scripts/setup-db.sql`, one dedicated `pg.Pool` singleton per role in `lib/db.ts`
(`getQaReaderPool`, `getQaWriterPool`, `getQaApiPool`, `getMetaPool`). **Never widen a role's
grants to cover another role's job** — the separation is deliberate:

- `qa_reader` — SELECT only. Backs `/api/v1/sql/select`.
- `qa_writer` — UPDATE only (plus SELECT — see gotcha below). Backs `/api/v1/sql/update`.
  Statements always require `WHERE`, enforced by `lib/sql-validator.ts`, not by the DB role.
- `qa_api` — SELECT+INSERT+UPDATE, **no DELETE**. Used *exclusively* by the fixed-SQL REST
  routes (`app/api/v1/**` except `sql/`). Routes that logically "delete" (e.g. revoking a role)
  do a soft-delete `UPDATE ... SET activo = false` instead.
- `app_meta` — internal bookkeeping only (`public.api_keys`, `public.sql_audit_log`).

Postgres gotchas already hit and fixed here — don't reintroduce them:
- An UPDATE/INSERT-capable role also needs a SELECT-type (or `FOR ALL`) RLS policy, not just an
  UPDATE/INSERT-type one — Postgres needs to "see" the row via SELECT to resolve
  WHERE/RETURNING, even for INSERT with RETURNING.
- INSERT into a `bigserial` PK needs `GRANT USAGE, SELECT` on the sequence, separate from the
  table-level INSERT grant — easy to forget, fails as "permission denied for sequence".
- To verify a role actually works against production, connect **directly** with `pg.Pool` using
  that role's own credentials — the Supabase MCP's `execute_sql` runs as its own service role
  and can't `SET ROLE` to test another role's permissions.

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
- `lib/openapi.ts` — hand-authored OpenAPI 3.1 spec (no zod-to-openapi generator), served by
  `app/api/v1/docs` and rendered at `/docs` via Scalar loaded from a CDN `<script>` (not the
  `@scalar/api-reference-react` package — its bundled CSS didn't survive Turbopack, see
  `app/docs/route.ts`). Every new route needs a matching `paths` entry here.
- `lib/rate-limit.ts` — Upstash Redis sliding window, 30 req/min, keyed by `apiKeyId` (not IP,
  since students may share a classroom network).
- `lib/audit-log.ts` — writes every request (success or failure) to `public.sql_audit_log`;
  never throws (a logging failure must not turn a 200 into a 500), and is always `await`ed
  rather than fire-and-forget since a Vercel function can freeze right after the response.

### Adding a new REST route under `app/api/v1/`

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

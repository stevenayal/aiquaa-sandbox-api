import { Pool, type PoolClient } from "pg";
import { getEnv } from "./env";

declare global {
  var __aiquaaPools:
    | {
        reader?: Pool;
        writer?: Pool;
        meta?: Pool;
        api?: Pool;
        readerV2?: Pool;
        writerV2?: Pool;
        apiV2?: Pool;
      }
    | undefined;
}

// Module-level singletons guarded on globalThis so Next.js dev-mode HMR
// reloads of this module don't leak a new Pool (and a new TCP connection)
// on every edit.
const pools = (globalThis.__aiquaaPools ??= {});

// pg-connection-string treats a "sslmode" query param (require/prefer/
// verify-ca) as an alias for "verify-full" and that strict verification
// wins over the `ssl: { rejectUnauthorized: false }` passed below —
// resulting in "self-signed certificate in certificate chain" against
// Supabase's pooler even though the code already relaxes verification.
// Confirmed live. Stripped here so a DATABASE_URL_* env var that happens
// to include "?sslmode=require" (an easy mistake — it looks like the
// obviously-correct thing to add) can't silently reintroduce this.
function stripSslMode(connectionString: string): string {
  const url = new URL(connectionString);
  url.searchParams.delete("sslmode");
  return url.toString();
}

function makePool(connectionString: string, searchPath?: string): Pool {
  return new Pool({
    connectionString: stripSslMode(connectionString),
    // Supabase's pooler cert chain isn't always in Node's default trust
    // store in serverless environments; this relaxes chain verification
    // while still using TLS (pg defaults to TLS when an `ssl` option is
    // present at all).
    ssl: { rejectUnauthorized: false },
    // One serverless invocation = one logical connection; the Supabase
    // transaction pooler handles real fan-out upstream. A larger local
    // pool buys nothing here and only churns connections against pgbouncer.
    max: 1,
    idleTimeoutMillis: 10_000,
    // Startup-parameter search_path (not a runtime `SET`) so it survives
    // pgbouncer transaction-mode pooling, where each query can land on a
    // different backend connection.
    ...(searchPath ? { options: `-c search_path=${searchPath}` } : {}),
  });
}

export function getQaReaderPool(): Pool {
  if (!pools.reader) {
    pools.reader = makePool(getEnv().DATABASE_URL_READER, "qa_training");
  }
  return pools.reader;
}

export function getQaWriterPool(): Pool {
  if (!pools.writer) {
    pools.writer = makePool(getEnv().DATABASE_URL_WRITER, "qa_training");
  }
  return pools.writer;
}

// Dedicated low-privilege pool for auth (api_keys) and audit logging
// (sql_audit_log). Kept separate from qa_reader/qa_writer so a bug in the
// SQL AST whitelist can never expose these tables: the roles that execute
// student-supplied SQL have no GRANTs on schema `public` at all.
export function getMetaPool(): Pool {
  if (!pools.meta) {
    pools.meta = makePool(getEnv().DATABASE_URL_META);
  }
  return pools.meta;
}

// Used only by the fixed-SQL REST endpoints under app/api/v1/** (auth,
// cuentas, transferencias, etc.) — never by the raw-SQL sandbox routes.
// SELECT+INSERT+UPDATE (no DELETE) on qa_training, granted to the `qa_api`
// role in scripts/setup-db.sql. Kept separate from qa_reader/qa_writer so
// those two stay exactly as restrictive as the raw-SQL sandbox requires;
// this pool's queries are all fixed at code-authoring time, never built
// from student-supplied SQL.
export function getQaApiPool(): Pool {
  if (!pools.api) {
    pools.api = makePool(getEnv().DATABASE_URL_API, "qa_training");
  }
  return pools.api;
}

// --- Curso 2 (schema qa_training_v2) ---------------------------------------
// Mismos roles y mismas connection strings que los pools de arriba: lo unico
// que cambia es el search_path, asi que agregar la cohorte no necesito roles
// ni variables de entorno nuevas. El aislamiento entre cursos lo impone
// Postgres (una conexion con search_path=qa_training_v2 no ve las tablas de
// qa_training sin calificar el schema, y el AST validator rechaza cualquier
// referencia calificada al otro schema).

export function getQaReaderV2Pool(): Pool {
  if (!pools.readerV2) {
    pools.readerV2 = makePool(getEnv().DATABASE_URL_READER, "qa_training_v2");
  }
  return pools.readerV2;
}

export function getQaWriterV2Pool(): Pool {
  if (!pools.writerV2) {
    pools.writerV2 = makePool(getEnv().DATABASE_URL_WRITER, "qa_training_v2");
  }
  return pools.writerV2;
}

// Equivalente de getQaApiPool() para las rutas REST fijas de /api/v2/**.
export function getQaApiV2Pool(): Pool {
  if (!pools.apiV2) {
    pools.apiV2 = makePool(getEnv().DATABASE_URL_API, "qa_training_v2");
  }
  return pools.apiV2;
}

// Runs `fn` inside a BEGIN/COMMIT (ROLLBACK on error) on a single dedicated
// connection checked out from `pool`. Needed only for the handful of REST
// routes that write to more than one table per request (e.g. an order plus
// its line items) — Supabase's transaction-mode pooler is designed for
// exactly this client-held BEGIN...COMMIT pattern.
export async function withTransaction<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

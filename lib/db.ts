import { Pool } from "pg";
import { getEnv } from "./env";

declare global {
  var __aiquaaPools: { reader?: Pool; writer?: Pool; meta?: Pool } | undefined;
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

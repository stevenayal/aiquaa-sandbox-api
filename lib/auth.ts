import type { Pool } from "pg";
import { getMetaPool } from "./db";

export type AuthResult =
  | { ok: true; apiKeyId: string; label: string; curso: number }
  | { ok: false; status: 401; message: string }
  | { ok: false; status: 500; message: string };

interface ApiKeyRow {
  id: string;
  label: string;
  active: boolean;
  // Cohorte del alumno dueno de la key (1 = curso original, 2 = Productos
  // Bancarios). Columna aditiva con DEFAULT 1, ver setup-db-v2.sql.
  curso: number | null;
}

const GENERIC_UNAUTHORIZED = "Invalid or inactive API key.";

// Accepts an injectable pool so callers (tests) don't need to mock the
// module-level singleton in ./db.
export async function authenticate(
  request: Request,
  pool?: Pick<Pool, "query">,
): Promise<AuthResult> {
  const apiKey = request.headers.get("x-api-key");
  if (!apiKey) {
    return { ok: false, status: 401, message: GENERIC_UNAUTHORIZED };
  }

  // Resolved lazily (not as a default parameter) so a missing-header 401
  // never triggers pool/env initialization.
  const resolvedPool = pool ?? getMetaPool();

  let rows: ApiKeyRow[];
  try {
    const result = await resolvedPool.query<ApiKeyRow>(
      "SELECT id, label, active, curso FROM public.api_keys WHERE api_key = $1 LIMIT 1",
      [apiKey],
    );
    rows = result.rows;
  } catch (e) {
    return {
      ok: false,
      status: 500,
      message: `Failed to verify API key: ${(e as Error).message}`,
    };
  }

  const row = rows[0];
  if (!row || !row.active) {
    return { ok: false, status: 401, message: GENERIC_UNAUTHORIZED };
  }

  // El ?? 1 cubre el intervalo entre desplegar este codigo y correr
  // setup-db-v2.sql: sin la columna todavia, toda key es del curso 1.
  return { ok: true, apiKeyId: row.id, label: row.label, curso: Number(row.curso ?? 1) };
}

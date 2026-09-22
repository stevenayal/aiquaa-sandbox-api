import type { Pool } from "pg";
import { getMetaPool } from "./db";
import { extractBearerToken, verifyGroupToken } from "./jwt";
import { JWT_SUBJECT_PREFIX } from "./audit-log";

export type AuthResult =
  | { ok: true; apiKeyId: string; label: string; curso: number; grupo?: number }
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

const GENERIC_UNAUTHORIZED =
  "Invalid or inactive credentials. Send an x-api-key header or an Authorization: Bearer <token>.";

// Dos vias de autenticacion, con x-api-key con precedencia para no cambiarle
// el comportamiento a nada de lo ya escrito por los alumnos:
//
//   1. x-api-key  -> public.api_keys (la via de siempre).
//   2. Authorization: Bearer <jwt> -> token de grupo emitido por
//      POST /api/v{1,2}/g{n}/auth/token. No toca la base: la firma ya prueba
//      que el token lo emitimos nosotros, y lleva curso y grupo adentro.
//
// Accepts an injectable pool so callers (tests) don't need to mock the
// module-level singleton in ./db.
export async function authenticate(
  request: Request,
  pool?: Pick<Pool, "query">,
): Promise<AuthResult> {
  const apiKey = request.headers.get("x-api-key");

  if (!apiKey) {
    const bearer = extractBearerToken(request.headers);
    if (bearer) {
      const claims = await verifyGroupToken(bearer);
      if (!claims) {
        return { ok: false, status: 401, message: GENERIC_UNAUTHORIZED };
      }
      // apiKeyId no es un uuid en esta via — lib/audit-log.ts lo detecta y lo
      // escribe en la columna `subject` con api_key_id NULL, porque
      // sql_audit_log.api_key_id tiene una FK contra public.api_keys.
      return {
        ok: true,
        apiKeyId: `${JWT_SUBJECT_PREFIX}${claims.sub}`,
        label: claims.sub,
        curso: claims.curso,
        grupo: claims.grupo,
      };
    }
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

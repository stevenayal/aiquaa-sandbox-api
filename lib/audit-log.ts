import { getMetaPool } from "./db";

// Prefijo del identificador cuando el sujeto autenticado es un JWT de grupo y
// no una API key. public.sql_audit_log.api_key_id es uuid REFERENCES
// public.api_keys(id): meter "jwt:g02_transf" ahi viola la FK, y como logAudit
// se traga los errores eso degradaria en CERO auditoria, en silencio, para
// todo el trafico con token. Por eso va a la columna `subject` con
// api_key_id = NULL.
export const JWT_SUBJECT_PREFIX = "jwt:";

export interface AuditLogEntry {
  /** UUID de public.api_keys, o un id "jwt:<username>" (ver splitSubject). */
  apiKeyId: string;
  sql: string;
  params: unknown[];
  success: boolean;
  error?: string;
  ip: string | null;
  /** Latencia del handler en ms — alimenta los percentiles del dashboard. */
  durationMs?: number | null;
  /** Status HTTP real: `success` no alcanza (un 404 tambien "sale bien"). */
  statusCode?: number | null;
  method?: string | null;
  /** Template normalizado (/api/v1/cuentas/{id}), no el path concreto. */
  route?: string | null;
}

export interface LogAuditOptions {
  // Fraccion de requests que se persisten (1 = todos, el default). A 3000
  // req/min el INSERT de auditoria pasa por el pool app_meta con max: 1 y se
  // convierte en el cuello de botella de la propia prueba de carga, ademas de
  // inflar la tabla. Se aplica a TODA entrada, exito o fallo: durante una
  // corrida de carga los 429 son tan masivos como los 200. Las rutas normales
  // no lo pasan y siguen auditando el 100%.
  sampleRate?: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Cualquier identificador que no sea un uuid va a `subject` con api_key_id
// NULL. Se testea la forma del uuid en vez del prefijo "jwt:" a proposito: asi
// un identificador nuevo que aparezca en el futuro degrada a `subject` en vez
// de romper la FK y dejarnos sin auditoria.
export function splitSubject(id: string): { apiKeyId: string | null; subject: string | null } {
  return UUID_RE.test(id) ? { apiKeyId: id, subject: null } : { apiKeyId: null, subject: id };
}

// /api/v1/cuentas/42 -> /api/v1/cuentas/{id}. Sin esto cada id concreto es una
// serie distinta en Grafana y no hay forma de agrupar por endpoint.
export function normalizeRoute(pathname: string): string {
  return pathname
    .split("/")
    .map((segment) => (/^\d+$/.test(segment) ? "{id}" : segment))
    .join("/");
}

// Never throws: a logging failure must not turn a legitimate 200/400
// response into a 500. Awaited by callers anyway (not fire-and-forget)
// because a Vercel serverless function can be frozen right after the
// response is sent, which would silently drop an un-awaited insert.
export async function logAudit(entry: AuditLogEntry, opts?: LogAuditOptions): Promise<void> {
  const sampleRate = opts?.sampleRate ?? 1;
  if (sampleRate < 1 && Math.random() >= sampleRate) {
    return;
  }

  const { apiKeyId, subject } = splitSubject(entry.apiKeyId);

  try {
    await getMetaPool().query(
      `INSERT INTO public.sql_audit_log
         (api_key_id, subject, sql, params, success, error, ip,
          duration_ms, status_code, method, route)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        apiKeyId,
        subject,
        entry.sql,
        JSON.stringify(entry.params),
        entry.success,
        entry.error ?? null,
        entry.ip,
        entry.durationMs ?? null,
        entry.statusCode ?? null,
        entry.method ?? null,
        entry.route ?? null,
      ],
    );
  } catch (e) {
    console.error("Failed to write sql_audit_log entry:", e);
  }
}

export function extractClientIp(headers: Headers): string | null {
  const forwarded =
    headers.get("x-vercel-forwarded-for") ??
    headers.get("x-forwarded-for") ??
    headers.get("x-real-ip");
  if (!forwarded) return null;
  return forwarded.split(",")[0].trim();
}

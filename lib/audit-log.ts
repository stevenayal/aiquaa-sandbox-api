import { getMetaPool } from "./db";

export interface AuditLogEntry {
  apiKeyId: string;
  sql: string;
  params: unknown[];
  success: boolean;
  error?: string;
  ip: string | null;
}

// Never throws: a logging failure must not turn a legitimate 200/400
// response into a 500. Awaited by callers anyway (not fire-and-forget)
// because a Vercel serverless function can be frozen right after the
// response is sent, which would silently drop an un-awaited insert.
export async function logAudit(entry: AuditLogEntry): Promise<void> {
  try {
    await getMetaPool().query(
      `INSERT INTO public.sql_audit_log (api_key_id, sql, params, success, error, ip)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        entry.apiKeyId,
        entry.sql,
        JSON.stringify(entry.params),
        entry.success,
        entry.error ?? null,
        entry.ip,
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

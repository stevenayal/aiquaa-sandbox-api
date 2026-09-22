import { NextResponse } from "next/server";
import { z } from "zod";
import type { Pool } from "pg";
import { authenticate } from "./auth";
import {
  checkRateLimit,
  rateLimitMessage,
  DEFAULT_RATE_LIMIT,
  type RateLimitConfig,
} from "./rate-limit";
import { validateSql, type StatementType } from "./sql-validator";
import { logAudit, extractClientIp, normalizeRoute } from "./audit-log";
import { errorResponse, rateLimitResponse, setRateLimitHeaders } from "./errors";

const bodySchema = z.object({
  sql: z.string().min(1).max(5000),
  params: z.array(z.unknown()).max(50).optional(),
});

export interface HandleSqlRequestOptions {
  expectedType: StatementType;
  requireWhere?: boolean;
  // A getter, not a resolved Pool: callers pass e.g. `getQaReaderPool`
  // itself (not its result), so the pool — and the env vars it needs — is
  // only touched once the request has passed auth/rate-limit/validation,
  // not merely because the route was hit.
  getPool: () => Pool;
  // Cohorte de la ruta (ver apiRoute): /api/v1/sql/* pasa curso 1 y
  // /api/v2/sql/* pasa curso 2 + el schema y la whitelist de tablas del curso 2.
  // schema/allowedTables omitidos = los del curso 1.
  curso?: number;
  schema?: string;
  allowedTables?: readonly string[];
  // Limite propio de la ruta; omitido = DEFAULT_RATE_LIMIT (30/min). Ver
  // lib/rate-limit.ts: cada config necesita su propio `bucket`.
  rateLimit?: RateLimitConfig;
}

// Shared pipeline for /api/v1/sql/select and /api/v1/sql/update — the two
// routes differ only in statement type, WHERE requirement, and which
// Postgres role's pool executes the query.
export async function handleSqlRequest(
  request: Request,
  options: HandleSqlRequestOptions,
): Promise<NextResponse> {
  const url = new URL(request.url);
  const method = request.method;
  const route = normalizeRoute(url.pathname);
  const rateLimitConfig = options.rateLimit ?? DEFAULT_RATE_LIMIT;

  const auth = await authenticate(request);
  if (!auth.ok) {
    return errorResponse(auth.status === 401 ? "UNAUTHORIZED" : "INTERNAL_ERROR", auth.message);
  }

  if (options.curso != null && auth.curso !== options.curso) {
    return errorResponse(
      "FORBIDDEN",
      `Esta API key pertenece al curso ${auth.curso} y esta ruta es del curso ${options.curso}.`,
    );
  }

  const rateLimit = await checkRateLimit(auth.apiKeyId, rateLimitConfig);
  if (!rateLimit.success) {
    return rateLimitResponse(rateLimitMessage(rateLimitConfig), {
      retryAfterSeconds: Math.max(1, Math.ceil((rateLimit.reset - Date.now()) / 1000)),
      limit: rateLimit.limit,
      remaining: rateLimit.remaining,
      reset: rateLimit.reset,
    });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    const json = await request.json();
    body = bodySchema.parse(json);
  } catch (e) {
    return errorResponse("VALIDATION_ERROR", "Invalid request body.", (e as Error).message);
  }

  const params = body.params ?? [];
  const ip = extractClientIp(request.headers);

  const validation = validateSql(body.sql, params, {
    expectedType: options.expectedType,
    requireWhere: options.requireWhere,
    schema: options.schema,
    allowedTables: options.allowedTables,
  });
  if (!validation.ok) {
    await logAudit({
      apiKeyId: auth.apiKeyId,
      sql: body.sql,
      params,
      success: false,
      error: validation.message,
      ip,
      statusCode: 400,
      method,
      route,
    });
    return errorResponse("VALIDATION_ERROR", validation.message);
  }

  const startedAt = performance.now();

  try {
    const result = await options.getPool().query(body.sql, params);
    await logAudit({
      apiKeyId: auth.apiKeyId,
      sql: body.sql,
      params,
      success: true,
      ip,
      durationMs: Math.round(performance.now() - startedAt),
      statusCode: 200,
      method,
      route,
    });
    const res = NextResponse.json({ data: result.rows, rowCount: result.rowCount });
    setRateLimitHeaders(res, rateLimit);
    return res;
  } catch (e) {
    const message = (e as Error).message;
    await logAudit({
      apiKeyId: auth.apiKeyId,
      sql: body.sql,
      params,
      success: false,
      error: message,
      ip,
      durationMs: Math.round(performance.now() - startedAt),
      statusCode: 400,
      method,
      route,
    });
    return errorResponse("EXECUTION_ERROR", message);
  }
}

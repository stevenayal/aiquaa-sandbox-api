import { NextResponse } from "next/server";
import { z } from "zod";
import type { Pool } from "pg";
import { authenticate } from "./auth";
import { checkRateLimit } from "./rate-limit";
import { validateSql, type StatementType } from "./sql-validator";
import { logAudit, extractClientIp } from "./audit-log";
import { errorResponse, rateLimitResponse } from "./errors";

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
}

// Shared pipeline for /api/v1/sql/select and /api/v1/sql/update — the two
// routes differ only in statement type, WHERE requirement, and which
// Postgres role's pool executes the query.
export async function handleSqlRequest(
  request: Request,
  options: HandleSqlRequestOptions,
): Promise<NextResponse> {
  const auth = await authenticate(request);
  if (!auth.ok) {
    return errorResponse(auth.status === 401 ? "UNAUTHORIZED" : "INTERNAL_ERROR", auth.message);
  }

  const rateLimit = await checkRateLimit(auth.apiKeyId);
  if (!rateLimit.success) {
    return rateLimitResponse("Rate limit exceeded. Max 30 requests per minute.", {
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
  });
  if (!validation.ok) {
    await logAudit({
      apiKeyId: auth.apiKeyId,
      sql: body.sql,
      params,
      success: false,
      error: validation.message,
      ip,
    });
    return errorResponse("VALIDATION_ERROR", validation.message);
  }

  try {
    const result = await options.getPool().query(body.sql, params);
    await logAudit({ apiKeyId: auth.apiKeyId, sql: body.sql, params, success: true, ip });
    return NextResponse.json({ data: result.rows, rowCount: result.rowCount });
  } catch (e) {
    const message = (e as Error).message;
    await logAudit({
      apiKeyId: auth.apiKeyId,
      sql: body.sql,
      params,
      success: false,
      error: message,
      ip,
    });
    return errorResponse("EXECUTION_ERROR", message);
  }
}

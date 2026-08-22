import { NextResponse } from "next/server";
import type { ZodType, ZodTypeDef } from "zod";
import { authenticate } from "./auth";
import { checkRateLimit } from "./rate-limit";
import { logAudit, extractClientIp } from "./audit-log";
import { errorResponse, rateLimitResponse } from "./errors";

export interface RouteContext {
  apiKeyId: string;
  ip: string | null;
}

export interface ApiRouteResult {
  status?: number;
  body: unknown;
}

export interface ApiRouteOptions<TInput> {
  // Only the *output* type is constrained to TInput — schemas that use
  // `.transform()` (e.g. the "true"/"false" string -> boolean pattern used
  // by several GET query schemas) legitimately have a different raw input
  // type, so the input generic is left as `any` rather than forcing it to
  // match TInput too.
  inputSchema: ZodType<TInput, ZodTypeDef, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  handler: (input: TInput, ctx: RouteContext) => Promise<ApiRouteResult>;
}

type NextRouteParams = { params: Promise<Record<string, string>> };

// Convenience for handlers that need to signal "not found" without an
// exception — keeps 404 in the same { status, body } result path as a
// normal response instead of exception-based control flow.
export function notFound(message: string): ApiRouteResult {
  return { status: 404, body: { error: { code: "NOT_FOUND", message } } };
}

// Convenience for a successful DELETE (soft-delete) — RFC 7231 says 204
// carries no body, so ApiRouteResult.body is ignored for status 204 in the
// success path below.
export function noContent(): ApiRouteResult {
  return { status: 204, body: null };
}

// Shared pipeline for the fixed-SQL REST endpoints under app/api/v1/**
// (auth, cuentas, transferencias, facturas, usuarios, tarjetas,
// notificaciones, ordenes, reservas, reportes, roles). Mirrors
// handle-sql-request.ts's auth -> rate-limit -> execute -> audit
// sequencing, but generic over a per-route zod schema + handler instead of
// student-supplied SQL: each route's SQL is fixed at code-authoring time.
export function apiRoute<TInput>(options: ApiRouteOptions<TInput>) {
  return async function (
    request: Request,
    routeCtx?: NextRouteParams,
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

    const url = new URL(request.url);
    const queryParams = Object.fromEntries(url.searchParams);
    const pathParams = routeCtx ? await routeCtx.params : {};

    let bodyParams: Record<string, unknown> = {};
    if (request.method !== "GET" && request.method !== "DELETE") {
      try {
        const text = await request.text();
        bodyParams = text ? JSON.parse(text) : {};
      } catch {
        return errorResponse("VALIDATION_ERROR", "Invalid JSON body.");
      }
    }

    // Precedence: query < body < path — a dynamic URL segment (e.g. the
    // [id] in /cuentas/[id]) always wins if a name collides with a query
    // or body field. One schema handles GET query strings, POST/PATCH
    // bodies, and path params uniformly.
    const raw = { ...queryParams, ...bodyParams, ...pathParams };

    let input: TInput;
    try {
      input = options.inputSchema.parse(raw);
    } catch (e) {
      return errorResponse("VALIDATION_ERROR", "Invalid request.", (e as Error).message);
    }

    const ip = extractClientIp(request.headers);
    // The SQL itself is fixed per route and already documented in
    // lib/openapi.ts/README — logging "METHOD path" plus the parsed input
    // (captured below via `params`) is enough to reconstruct what ran,
    // without a hand-authored SQL label per route.
    const auditSql = `${request.method} ${url.pathname}`;

    try {
      const result = await options.handler(input, { apiKeyId: auth.apiKeyId, ip });
      await logAudit({
        apiKeyId: auth.apiKeyId,
        sql: auditSql,
        params: [input],
        success: true,
        ip,
      });
      // A 204 must carry no body at all — NextResponse.json(null, ...) would
      // still send the 4-byte string "null" as the body.
      if (result.status === 204) {
        return new NextResponse(null, { status: 204 });
      }
      return NextResponse.json(result.body, { status: result.status ?? 200 });
    } catch (e) {
      const message = (e as Error).message;
      await logAudit({
        apiKeyId: auth.apiKeyId,
        sql: auditSql,
        params: [input],
        success: false,
        error: message,
        ip,
      });
      // node-postgres attaches the Postgres SQLSTATE as `.code` on thrown
      // errors — map the ones a Zod schema can't catch (they only surface
      // once the query hits the DB) to the correct RFC 7231 status instead
      // of the generic EXECUTION_ERROR/400 fallback.
      const pgCode = (e as { code?: string }).code;
      if (pgCode === "23505") {
        return errorResponse("CONFLICT", message);
      }
      if (pgCode === "23503" || pgCode === "23514") {
        return errorResponse("VALIDATION_ERROR", message);
      }
      return errorResponse("EXECUTION_ERROR", message);
    }
  };
}

import { NextResponse } from "next/server";
import type { ZodType, ZodTypeDef } from "zod";
import { authenticate } from "./auth";
import {
  checkRateLimit,
  rateLimitMessage,
  DEFAULT_RATE_LIMIT,
  type RateLimitConfig,
} from "./rate-limit";
import { logAudit, extractClientIp, normalizeRoute } from "./audit-log";
import { errorResponse, rateLimitResponse, setRateLimitHeaders } from "./errors";

export interface RouteContext {
  apiKeyId: string;
  curso: number;
  // Grupo del sujeto cuando se autentico con un JWT de grupo; undefined con
  // x-api-key (public.api_keys no tiene vinculo con un grupo). Ninguna ruta lo
  // usa todavia — queda disponible para un futuro gate por grupo.
  grupo?: number;
  ip: string | null;
  // Headers crudos del request. apiRoute ya normaliza query/body/path en
  // `input`, pero hay metadatos que son headers por contrato y no parametros:
  // hoy Idempotency-Key en POST /api/perf/db.
  headers: Headers;
}

export interface ApiRouteResult {
  status?: number;
  body: unknown;
  // Headers extra de la respuesta, para lo que es semantica de protocolo y no
  // datos — hoy Idempotent-Replay en POST /api/perf/db.
  headers?: Record<string, string>;
}

export interface ApiRouteOptions<TInput> {
  // Only the *output* type is constrained to TInput — schemas that use
  // `.transform()` (e.g. the "true"/"false" string -> boolean pattern used
  // by several GET query schemas) legitimately have a different raw input
  // type, so the input generic is left as `any` rather than forcing it to
  // match TInput too.
  inputSchema: ZodType<TInput, ZodTypeDef, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  handler: (input: TInput, ctx: RouteContext) => Promise<ApiRouteResult>;
  // Cohorte a la que pertenece la ruta: /api/v1 pasa `curso: 1` y /api/v2 pasa
  // `curso: 2`, y cada una solo acepta keys de su curso. Omitirlo deja la ruta
  // abierta a cualquier key válida — hoy solo lo hacen /api/v1/roster, que el
  // frontend necesita para descubrir el curso del alumno, y /api/perf/**, que
  // es superficie de demo y no pertenece a ninguna cohorte.
  curso?: number;
  // Limite propio de la ruta. Omitido = DEFAULT_RATE_LIMIT (30/min), que es lo
  // que usan las 72 rutas del curso. Cada config necesita su propio `bucket`
  // (ver lib/rate-limit.ts) o dos rutas comparten ventana en Redis.
  rateLimit?: RateLimitConfig;
  // Fraccion de requests auditados (1 = todos). Solo /api/perf/** lo baja.
  auditSampleRate?: number;
}

type NextRouteParams = { params: Promise<Record<string, string>> };

// Convenience for handlers that need to signal "not found" without an
// exception — keeps 404 in the same { status, body } result path as a
// normal response instead of exception-based control flow.
export function notFound(message: string): ApiRouteResult {
  return { status: 404, body: { error: { code: "NOT_FOUND", message } } };
}

// Regla de negocio violada sobre un recurso que si existe (saldo
// insuficiente, prestamo ya aprobado, cuota ya pagada). 409, no 400: el body
// es valido, el estado actual del recurso es el que no permite la operacion.
export function conflict(message: string): ApiRouteResult {
  return { status: 409, body: { error: { code: "CONFLICT", message } } };
}

// Input semanticamente invalido que zod no puede validar solo (p. ej. un
// limite de tarjeta menor al saldo ya utilizado, que depende de la fila).
export function badRequest(message: string): ApiRouteResult {
  return { status: 400, body: { error: { code: "VALIDATION_ERROR", message } } };
}

// El sujeto esta autenticado pero no le corresponde este recurso — p. ej. la
// credencial del grupo 3 pidiendo el token del grupo 2. Simetrico al gate de
// curso de mas abajo: 403, no 401, porque las credenciales si son validas.
export function forbidden(message: string): ApiRouteResult {
  return { status: 403, body: { error: { code: "FORBIDDEN", message } } };
}

// Convenience for a successful DELETE (soft-delete) — RFC 7231 says 204
// carries no body, so ApiRouteResult.body is ignored for status 204 in the
// success path below.
export function noContent(): ApiRouteResult {
  return { status: 204, body: null };
}

// Muestreo de las respuestas que una prueba de carga produce en masa y que
// antes no se auditaban en absoluto (se devolvian antes de logAudit), justo
// las mas interesantes para la charla de rate limit.
const UNAUTHORIZED_AUDIT_SAMPLE = 0.1;
const RATE_LIMITED_AUDIT_SAMPLE = 0.05;

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
    const url = new URL(request.url);
    const method = request.method;
    const route = normalizeRoute(url.pathname);
    const ip = extractClientIp(request.headers);
    const rateLimitConfig = options.rateLimit ?? DEFAULT_RATE_LIMIT;
    // The SQL itself is fixed per route and already documented in
    // lib/openapi.ts/README — logging "METHOD path" plus the parsed input
    // (captured below via `params`) is enough to reconstruct what ran,
    // without a hand-authored SQL label per route.
    const auditSql = `${method} ${url.pathname}`;

    const auth = await authenticate(request);
    if (!auth.ok) {
      await logAudit(
        {
          apiKeyId: "anon",
          sql: auditSql,
          params: [],
          success: false,
          error: auth.message,
          ip,
          statusCode: auth.status,
          method,
          route,
        },
        { sampleRate: UNAUTHORIZED_AUDIT_SAMPLE },
      );
      return errorResponse(auth.status === 401 ? "UNAUTHORIZED" : "INTERNAL_ERROR", auth.message);
    }

    // Aislamiento entre cohortes: los datos ya viven en schemas distintos
    // (qa_training vs qa_training_v2), pero sin este chequeo una key de un curso
    // puede leer y ESCRIBIR los datos del otro — pasó en producción: una key de
    // curso 2 creó una transferencia en /api/v1. 403, no 401: la key es
    // válida, simplemente no es de este curso.
    if (options.curso != null && auth.curso !== options.curso) {
      const message = `Esta API key pertenece al curso ${auth.curso} y esta ruta es del curso ${options.curso}.`;
      await logAudit({
        apiKeyId: auth.apiKeyId,
        sql: auditSql,
        params: [],
        success: false,
        error: message,
        ip,
        statusCode: 403,
        method,
        route,
      });
      return errorResponse("FORBIDDEN", message);
    }

    const rateLimit = await checkRateLimit(auth.apiKeyId, rateLimitConfig);
    if (!rateLimit.success) {
      const message = rateLimitMessage(rateLimitConfig);
      await logAudit(
        {
          apiKeyId: auth.apiKeyId,
          sql: auditSql,
          params: [],
          success: false,
          error: message,
          ip,
          statusCode: 429,
          method,
          route,
        },
        { sampleRate: RATE_LIMITED_AUDIT_SAMPLE },
      );
      return rateLimitResponse(message, {
        retryAfterSeconds: Math.max(1, Math.ceil((rateLimit.reset - Date.now()) / 1000)),
        limit: rateLimit.limit,
        remaining: rateLimit.remaining,
        reset: rateLimit.reset,
      });
    }

    const queryParams = Object.fromEntries(url.searchParams);
    const pathParams = routeCtx ? await routeCtx.params : {};

    let bodyParams: Record<string, unknown> = {};
    if (method !== "GET" && method !== "DELETE") {
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

    const startedAt = performance.now();

    try {
      const result = await options.handler(input, {
        apiKeyId: auth.apiKeyId,
        curso: auth.curso,
        grupo: auth.grupo,
        ip,
        headers: request.headers,
      });
      const status = result.status ?? 200;
      await logAudit(
        {
          apiKeyId: auth.apiKeyId,
          sql: auditSql,
          params: [input],
          success: true,
          ip,
          durationMs: Math.round(performance.now() - startedAt),
          statusCode: status,
          method,
          route,
        },
        { sampleRate: options.auditSampleRate },
      );
      // A 204 must carry no body at all — NextResponse.json(null, ...) would
      // still send the 4-byte string "null" as the body.
      // Casi todo responde JSON. La excepcion es un handler que devuelve un
      // string Y declara su propio content-type (hoy solo
      // /api/perf/metrics?format=prometheus, que tiene que servir texto plano
      // en el formato de exposicion de Prometheus para que Alloy lo scrapee).
      const declaredContentType =
        result.headers?.["content-type"] ?? result.headers?.["Content-Type"];
      const res =
        status === 204
          ? new NextResponse(null, { status: 204 })
          : typeof result.body === "string" && declaredContentType
            ? new NextResponse(result.body, {
                status,
                headers: { "content-type": declaredContentType },
              })
            : NextResponse.json(result.body, { status });
      setRateLimitHeaders(res, rateLimit);
      for (const [name, value] of Object.entries(result.headers ?? {})) {
        res.headers.set(name, value);
      }
      return res;
    } catch (e) {
      const message = (e as Error).message;
      // node-postgres attaches the Postgres SQLSTATE as `.code` on thrown
      // errors — map the ones a Zod schema can't catch (they only surface
      // once the query hits the DB) to the correct RFC 7231 status instead
      // of the generic EXECUTION_ERROR/400 fallback.
      const pgCode = (e as { code?: string }).code;
      const code =
        pgCode === "23505"
          ? "CONFLICT"
          : pgCode === "23503" || pgCode === "23514"
            ? "VALIDATION_ERROR"
            : "EXECUTION_ERROR";
      await logAudit({
        apiKeyId: auth.apiKeyId,
        sql: auditSql,
        params: [input],
        success: false,
        error: message,
        ip,
        durationMs: Math.round(performance.now() - startedAt),
        statusCode: code === "CONFLICT" ? 409 : 400,
        method,
        route,
      });
      return errorResponse(code, message);
    }
  };
}

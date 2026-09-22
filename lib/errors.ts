import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "RATE_LIMITED"
  | "VALIDATION_ERROR"
  | "EXECUTION_ERROR"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL_ERROR";

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
}

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  UNAUTHORIZED: 401,
  RATE_LIMITED: 429,
  FORBIDDEN: 403,
  VALIDATION_ERROR: 400,
  EXECUTION_ERROR: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
};

export function errorResponse(
  code: ApiErrorCode,
  message: string,
  details?: unknown,
): NextResponse<ApiErrorBody> {
  const status = STATUS_BY_CODE[code];
  const body: ApiErrorBody = { error: { code, message, details } };
  return NextResponse.json(body, { status });
}

export function rateLimitResponse(
  message: string,
  opts: { retryAfterSeconds: number; limit: number; remaining: number; reset: number },
): NextResponse<ApiErrorBody> {
  const res = errorResponse("RATE_LIMITED", message);
  res.headers.set("Retry-After", String(opts.retryAfterSeconds));
  res.headers.set("X-RateLimit-Limit", String(opts.limit));
  res.headers.set("X-RateLimit-Remaining", String(opts.remaining));
  res.headers.set("X-RateLimit-Reset", String(opts.reset));
  return res;
}

// Los mismos X-RateLimit-* que rateLimitResponse pone en el 429, pero para
// respuestas exitosas: un plan de JMeter necesita ver el presupuesto restante
// en cada respuesta, no solo cuando ya choco contra la pared.
// Nota: X-RateLimit-Reset va en milisegundos Unix (lo que devuelve Upstash),
// no en segundos como propone el draft IETF. Documentado asi en el README.
export function setRateLimitHeaders(
  res: NextResponse,
  opts: { limit: number; remaining: number; reset: number },
): void {
  res.headers.set("X-RateLimit-Limit", String(opts.limit));
  res.headers.set("X-RateLimit-Remaining", String(opts.remaining));
  res.headers.set("X-RateLimit-Reset", String(opts.reset));
}

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { getEnv } from "./env";

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  /** Unix ms timestamp when the current window resets. */
  reset: number;
}

export interface RateLimitConfig {
  requests: number;
  windowSeconds: number;
  // Namespace de las claves en Redis. TIENE que ser distinto por cada config
  // distinta: dos limites que comparten bucket comparten las mismas claves, y
  // la ruta mas permisiva le vacia la ventana a la mas estricta (una corrida
  // de carga contra /api/perf/echo dejaria a los alumnos sin sus 30/min).
  bucket: string;
}

// 30 requests/minuto por API key — generoso para exploracion interactiva con
// Postman, suficientemente ajustado para frenar el bucle descontrolado de un
// alumno. Es el limite de las 72 rutas del curso; solo /api/perf/** lo sube.
export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  requests: 30,
  windowSeconds: 60,
  bucket: "default",
};

declare global {
  var __aiquaaRateLimiters: Map<string, Ratelimit> | undefined;
  var __aiquaaRedis: Redis | undefined;
}

// Cacheado en globalThis igual que los pools de ./db: sin esto cada recarga de
// HMR en dev construye limitadores nuevos.
const limiters = (globalThis.__aiquaaRateLimiters ??= new Map<string, Ratelimit>());

function getRedis(): Redis {
  if (!globalThis.__aiquaaRedis) {
    const env = getEnv();
    globalThis.__aiquaaRedis = new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return globalThis.__aiquaaRedis;
}

function getRatelimit(cfg: RateLimitConfig): Ratelimit {
  const cacheKey = `${cfg.bucket}:${cfg.requests}:${cfg.windowSeconds}`;
  let limiter = limiters.get(cacheKey);
  if (!limiter) {
    const window = `${cfg.windowSeconds} s` as const;
    limiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(cfg.requests, window),
      prefix: `aiquaa-sandbox:${cfg.bucket}`,
    });
    limiters.set(cacheKey, limiter);
  }
  return limiter;
}

// Keyed by apiKeyId (post-authentication), not IP — many students may share
// a network (classroom Wi-Fi/NAT), and the limit is meant to be per-student.
export async function checkRateLimit(
  apiKeyId: string,
  cfg: RateLimitConfig = DEFAULT_RATE_LIMIT,
): Promise<RateLimitResult> {
  const { success, limit, remaining, reset } = await getRatelimit(cfg).limit(apiKeyId);
  return { success, limit, remaining, reset };
}

// Mensaje del 429 derivado de la config real de la ruta — hardcodear
// "Max 30 requests per minute" haria mentir a toda ruta con otro limite.
export function rateLimitMessage(cfg: RateLimitConfig): string {
  return `Rate limit exceeded. Max ${cfg.requests} requests per ${cfg.windowSeconds} seconds.`;
}

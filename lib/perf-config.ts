import { randomUUID } from "node:crypto";
import { DEFAULT_RATE_LIMIT, type RateLimitConfig } from "./rate-limit";

// Limites de /api/perf/**. Cada uno con su propio `bucket`: comparten el
// identificador (la API key) pero NO la ventana de Redis, que es justamente lo
// que permite estresar /echo a 3000/min sin dejar sin presupuesto a las 72
// rutas del curso, que siguen en el bucket "default".
export const PERF_RATE_LIMITS = {
  // Sin DB: mide el coste del pipeline (auth + Redis + zod) y nada mas.
  echo: { requests: 3000, windowSeconds: 60, bucket: "perf-echo" },
  // Gemelo exacto de `echo` con un limite bajo: la pared de 429 en vivo.
  echoLimited: { requests: 10, windowSeconds: 60, bucket: "perf-echo-limited" },
  dbRead: { requests: 1000, windowSeconds: 60, bucket: "perf-db-read" },
  dbWrite: { requests: 300, windowSeconds: 60, bucket: "perf-db-write" },
  // Los endpoints de introspeccion se quedan en 30/min: no tiene sentido que
  // la propia prueba de carga se lleve puesto el endpoint que la mide.
  meta: DEFAULT_RATE_LIMIT,
} satisfies Record<string, RateLimitConfig>;

// Muestreo de auditoria de las rutas de carga. A 3000 req/min el INSERT en
// public.sql_audit_log (pool app_meta, max: 1) se vuelve el cuello de botella
// de la propia prueba.
export const PERF_AUDIT_SAMPLE = {
  echo: 0.05,
  db: 0.1,
} as const;

// Identificador de ESTA instancia del proceso. En Vercel cada lambda tiene el
// suyo y desaparece con ella: es lo que permite ver, en /api/perf/metrics, que
// no hay "un servidor" que crece sino N instancias efimeras.
export const INSTANCE_ID = randomUUID().slice(0, 8);
export const INSTANCE_STARTED_AT = Date.now();

// Techos conocidos del sistema, relevados contra la instancia real (Supabase
// hocryhxndegslzfiwlnx, Postgres 17.6, us-east-1) el 2026-09-22 con:
//   SELECT name, setting FROM pg_settings WHERE name IN (...);
//
// Esto es lo que GET /api/perf/limits publica: el contrato que un QA deberia
// EXIGIR antes de disenar un plan de carga, en vez de descubrirlo durante la
// corrida. Si la instancia cambia de tamano, estos numeros mienten — volver a
// correr la consulta.
export const SYSTEM_LIMITS = {
  postgres: {
    version: "17.6",
    // El techo real del sistema: no es la CPU de la app, son 60 conexiones.
    maxConnections: 60,
    sharedBuffersMb: 224,
    workMemKb: 2184,
    planCacheMode: "auto",
    // track_planning esta en off, por eso pg_stat_statements reporta
    // total_plan_time = 0 y el "hard parse" hay que mostrarlo por el conteo de
    // entradas, no por el tiempo de planificacion.
    trackPlanning: false,
  },
  conexion: {
    modo: "transaction pooler (pgbouncer, puerto 6543)",
    poolMaxPorInstancia: 1,
    // pgbouncer en modo transaccion no sostiene prepared statements con
    // nombre: cada pool.query se vuelve a parsear y planificar. Es el
    // equivalente Postgres del "hard parse" de Oracle, y esta aca, en esta app.
    preparedStatementsReutilizados: false,
  },
  runtime: {
    plataforma: "Vercel serverless (runtime nodejs)",
    // No hay un pod que crezca: hay N instancias efimeras con cold start.
    escalado: "horizontal, instancias efimeras",
  },
  rateLimits: {
    rutasDelCurso: `${DEFAULT_RATE_LIMIT.requests}/${DEFAULT_RATE_LIMIT.windowSeconds}s`,
    perfEcho: `${PERF_RATE_LIMITS.echo.requests}/${PERF_RATE_LIMITS.echo.windowSeconds}s`,
    perfEchoLimited: `${PERF_RATE_LIMITS.echoLimited.requests}/${PERF_RATE_LIMITS.echoLimited.windowSeconds}s`,
    perfDbRead: `${PERF_RATE_LIMITS.dbRead.requests}/${PERF_RATE_LIMITS.dbRead.windowSeconds}s`,
    perfDbWrite: `${PERF_RATE_LIMITS.dbWrite.requests}/${PERF_RATE_LIMITS.dbWrite.windowSeconds}s`,
  },
} as const;

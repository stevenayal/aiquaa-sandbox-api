export const runtime = "nodejs";

import { z } from "zod";
import { getMetaPool } from "@/lib/db";
import { apiRoute } from "@/lib/api-route";
import {
  INSTANCE_ID,
  INSTANCE_STARTED_AT,
  PERF_RATE_LIMITS,
} from "@/lib/perf-config";

const schema = z.object({
  // Ventana de agregacion en minutos.
  minutos: z.coerce.number().int().min(1).max(1440).default(15),
  format: z.enum(["json", "prometheus"]).default("json"),
});

interface ResumenRow {
  requests: number;
  errores: number;
  rate_limited: number;
  p50: string | null;
  p95: string | null;
  p99: string | null;
  max_ms: number | null;
}

interface PorRutaRow {
  route: string | null;
  method: string | null;
  requests: number;
  errores: number;
  p95: string | null;
}

// El muestreo de /api/perf/** significa que `requests` NO es el total real de
// requests: es el total de filas auditadas. El factor esta documentado en
// PERF_AUDIT_SAMPLE y se expone aca para que nadie lea los numeros de mas.
const RESUMEN_SQL = `
  SELECT
    count(*)::int                                            AS requests,
    count(*) FILTER (WHERE status_code >= 400)::int          AS errores,
    count(*) FILTER (WHERE status_code = 429)::int           AS rate_limited,
    percentile_cont(0.5)  WITHIN GROUP (ORDER BY duration_ms) AS p50,
    percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95,
    percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms) AS p99,
    max(duration_ms)                                          AS max_ms
  FROM public.sql_audit_log
  WHERE created_at >= now() - make_interval(mins => $1::int)
`;

const POR_RUTA_SQL = `
  SELECT
    route,
    method,
    count(*)::int                                   AS requests,
    count(*) FILTER (WHERE status_code >= 400)::int AS errores,
    percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95
  FROM public.sql_audit_log
  WHERE created_at >= now() - make_interval(mins => $1::int)
    AND route IS NOT NULL
  GROUP BY route, method
  ORDER BY count(*) DESC
  LIMIT 25
`;

function num(value: string | number | null): number | null {
  if (value === null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
}

// Metricas del proceso de ESTA instancia. En Vercel no hay un pod con cgroup
// que scrapear: esto es auto-reporte, y por eso viene etiquetado con
// instanceId — varias instancias efimeras reportan cada una lo suyo, y eso ES
// el contraste con el modelo de un pod de k8s que crece.
function procesoActual() {
  const mem = process.memoryUsage();
  const cpu = process.cpuUsage();
  return {
    instanceId: INSTANCE_ID,
    uptimeSeconds: Math.round((Date.now() - INSTANCE_STARTED_AT) / 1000),
    rssMb: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
    heapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10,
    heapTotalMb: Math.round((mem.heapTotal / 1024 / 1024) * 10) / 10,
    externalMb: Math.round((mem.external / 1024 / 1024) * 10) / 10,
    cpuUserMs: Math.round(cpu.user / 1000),
    cpuSystemMs: Math.round(cpu.system / 1000),
  };
}

function prometheus(
  resumen: ResumenRow,
  proceso: ReturnType<typeof procesoActual>,
  minutos: number,
): string {
  const i = `instance="${proceso.instanceId}"`;
  const lineas = [
    "# HELP aiquaa_requests_total Requests auditados en la ventana.",
    "# TYPE aiquaa_requests_total gauge",
    `aiquaa_requests_total{${i},window_minutes="${minutos}"} ${resumen.requests}`,
    "# HELP aiquaa_errors_total Respuestas con status >= 400 en la ventana.",
    "# TYPE aiquaa_errors_total gauge",
    `aiquaa_errors_total{${i},window_minutes="${minutos}"} ${resumen.errores}`,
    "# HELP aiquaa_rate_limited_total Respuestas 429 en la ventana.",
    "# TYPE aiquaa_rate_limited_total gauge",
    `aiquaa_rate_limited_total{${i},window_minutes="${minutos}"} ${resumen.rate_limited}`,
    "# HELP aiquaa_latency_ms Latencia del handler por percentil.",
    "# TYPE aiquaa_latency_ms gauge",
    `aiquaa_latency_ms{${i},quantile="0.5"} ${num(resumen.p50) ?? 0}`,
    `aiquaa_latency_ms{${i},quantile="0.95"} ${num(resumen.p95) ?? 0}`,
    `aiquaa_latency_ms{${i},quantile="0.99"} ${num(resumen.p99) ?? 0}`,
    "# HELP aiquaa_process_memory_mb Memoria del proceso de esta instancia.",
    "# TYPE aiquaa_process_memory_mb gauge",
    `aiquaa_process_memory_mb{${i},kind="rss"} ${proceso.rssMb}`,
    `aiquaa_process_memory_mb{${i},kind="heap_used"} ${proceso.heapUsedMb}`,
    "# HELP aiquaa_process_cpu_ms CPU acumulada del proceso de esta instancia.",
    "# TYPE aiquaa_process_cpu_ms counter",
    `aiquaa_process_cpu_ms{${i},kind="user"} ${proceso.cpuUserMs}`,
    `aiquaa_process_cpu_ms{${i},kind="system"} ${proceso.cpuSystemMs}`,
    "# HELP aiquaa_process_uptime_seconds Segundos de vida de esta instancia.",
    "# TYPE aiquaa_process_uptime_seconds gauge",
    `aiquaa_process_uptime_seconds{${i}} ${proceso.uptimeSeconds}`,
  ];
  return `${lineas.join("\n")}\n`;
}

// GET /api/perf/metrics — percentiles, tasa de error y consumo del proceso.
//
// Los percentiles salen de public.sql_audit_log (duration_ms/status_code, que
// se agregaron para esto): son de TODA la flota, no de esta instancia. Las
// metricas de proceso, en cambio, son solo de esta instancia — no se pueden
// sumar entre lambdas.
export const GET = apiRoute({
  inputSchema: schema,
  rateLimit: PERF_RATE_LIMITS.meta,
  handler: async ({ minutos, format }) => {
    const pool = getMetaPool();
    const [resumenRes, porRutaRes] = await Promise.all([
      pool.query<ResumenRow>(RESUMEN_SQL, [minutos]),
      pool.query<PorRutaRow>(POR_RUTA_SQL, [minutos]),
    ]);

    const resumen = resumenRes.rows[0];
    const proceso = procesoActual();

    if (format === "prometheus") {
      return {
        body: prometheus(resumen, proceso, minutos),
        headers: { "content-type": "text/plain; version=0.0.4; charset=utf-8" },
      };
    }

    const requests = resumen.requests;
    return {
      body: {
        data: {
          ventanaMinutos: minutos,
          resumen: {
            requestsAuditados: requests,
            errores: resumen.errores,
            rateLimited: resumen.rate_limited,
            tasaErrorPct: requests > 0 ? Math.round((resumen.errores / requests) * 1000) / 10 : 0,
            rpsAuditado: Math.round((requests / (minutos * 60)) * 100) / 100,
            p50Ms: num(resumen.p50),
            p95Ms: num(resumen.p95),
            p99Ms: num(resumen.p99),
            maxMs: resumen.max_ms,
          },
          porRuta: porRutaRes.rows.map((r) => ({
            route: r.route,
            method: r.method,
            requests: r.requests,
            errores: r.errores,
            p95Ms: num(r.p95),
          })),
          proceso,
          nota:
            "Las rutas /api/perf/** se auditan muestreadas (echo 5%, db 10%), asi que " +
            "requestsAuditados NO es el total real durante una prueba de carga. " +
            "Las metricas de `proceso` son de esta instancia sola, no de la flota.",
        },
      },
    };
  },
});

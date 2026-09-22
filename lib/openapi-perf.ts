// Spec propio de /api/perf/**, separado de los dos specs de curso a proposito:
// no es material de ninguna cohorte, es la superficie de la charla de
// rendimiento. Mismo estilo factorizado que lib/openapi-v2.ts.

import { PERF_RATE_LIMITS, SYSTEM_LIMITS } from "./perf-config";

function errRef(description: string) {
  return {
    description,
    content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
  };
}

function dataOf(ref: string, description: string) {
  return {
    description,
    content: {
      "application/json": {
        schema: { type: "object", properties: { data: { $ref: `#/components/schemas/${ref}` } } },
      },
    },
  };
}

const authErrors = {
  "401": errRef("API key inválida, inactiva o ausente"),
  "429": errRef("Límite de requests excedido — mirá Retry-After y X-RateLimit-Reset"),
};

const CARGA = "Carga";
const INTROSPECCION = "Introspección";

const echoParams = [
  {
    name: "delayMs",
    in: "query",
    required: false,
    schema: { type: "integer", minimum: 0, maximum: 5000, default: 0 },
    description: "Latencia artificial. Mueve el p95 sin tocar la base de datos.",
  },
  {
    name: "bytes",
    in: "query",
    required: false,
    schema: { type: "integer", minimum: 0, maximum: 100000, default: 0 },
    description: "Tamaño del payload sintético de respuesta, para hablar del coste de red.",
  },
  {
    name: "errorRate",
    in: "query",
    required: false,
    schema: { type: "number", minimum: 0, maximum: 1, default: 0 },
    description: "Fracción de requests que fallan a propósito, para que la gráfica de error tenga algo que mostrar.",
  },
];

export const openApiSpecPerf = {
  openapi: "3.1.0",
  info: {
    title: "aiquaa Sandbox API — Performance",
    version: "1.0.0",
    description:
      "Superficie dedicada a pruebas de rendimiento y a la demo en vivo de monitoreo. " +
      "No pertenece a ninguna cohorte: acepta cualquier API key válida (curso 1 o 2). " +
      "\n\n" +
      "**Los límites de este namespace son distintos a los del curso.** Cada ruta tiene su " +
      "propio bucket en Redis, así que estresar `/api/perf/echo` a 3000/min NO consume el " +
      "presupuesto de 30/min de las rutas del curso.\n\n" +
      `**Techo real del sistema: ${SYSTEM_LIMITS.postgres.maxConnections} conexiones de ` +
      "Postgres** — no la CPU de la API. Consultá `GET /api/perf/limits` antes de diseñar " +
      "un plan de carga.\n\n" +
      "Las rutas de carga se auditan **muestreadas** (echo 5%, db 10%): a 3000 req/min el " +
      "INSERT en `sql_audit_log` sería el cuello de botella de la propia prueba.",
  },
  servers: [{ url: "/" }],
  tags: [
    { name: CARGA, description: "Endpoints diseñados para ser estresados. Rate limits altos y auditoría muestreada." },
    { name: INTROSPECCION, description: "Techos del sistema y métricas agregadas. Se quedan en 30/min: la prueba no debe llevarse puesto el instrumento que la mide." },
  ],
  components: {
    securitySchemes: {
      ApiKeyAuth: { type: "apiKey", in: "header", name: "x-api-key" },
      BearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    schemas: {
      ErrorResponse: {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: {
              code: {
                type: "string",
                enum: [
                  "UNAUTHORIZED",
                  "FORBIDDEN",
                  "RATE_LIMITED",
                  "VALIDATION_ERROR",
                  "EXECUTION_ERROR",
                  "NOT_FOUND",
                  "CONFLICT",
                  "INTERNAL_ERROR",
                ],
              },
              message: { type: "string" },
              details: {},
            },
          },
        },
      },
      EchoResult: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
          instanceId: {
            type: "string",
            description:
              "Identificador del proceso que atendió la request. El mismo id en muchas " +
              "respuestas = una sola instancia; ids distintos = Vercel escaló horizontalmente.",
          },
          limit: { type: "string", enum: ["echo", "echoLimited"] },
          delayMs: { type: "integer" },
          servedAt: { type: "string", format: "date-time" },
          payload: { type: "string" },
        },
      },
      DbResult: {
        type: "object",
        properties: {
          instanceId: { type: "string" },
          mode: { type: "string", enum: ["parametrizada", "literal"] },
          indexed: { type: "boolean" },
          columnaFiltrada: { type: "string", enum: ["categoria", "codigo"] },
          sql: { type: "string", description: "El SQL exacto que se ejecutó." },
          rowCount: { type: "integer" },
          dbMs: { type: "integer" },
          filas: { type: "array", items: { type: "object" } },
        },
      },
      DbWriteResult: {
        type: "object",
        properties: {
          id: { type: "integer" },
          categoria: { type: "string" },
          codigo: { type: "string" },
          monto: { type: "string" },
          instanceId: { type: "string" },
        },
      },
      Limits: { type: "object", description: "Techos del sistema + conexiones vivas." },
      Metrics: { type: "object", description: "Percentiles, tasa de error y consumo del proceso." },
    },
  },
  security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
  paths: {
    "/api/perf/echo": {
      get: {
        tags: [CARGA],
        summary: `Echo sin base de datos (${PERF_RATE_LIMITS.echo.requests}/min)`,
        description:
          "Baseline: mide el coste del pipeline (auth + Redis + zod) y nada más. " +
          "Gemelo exacto de `/api/perf/echo-limited` salvo por el rate limit — correr el " +
          "mismo plan de JMeter contra los dos aísla el efecto del rate limit de cualquier " +
          "otra variable.",
        parameters: echoParams,
        responses: {
          "200": dataOf("EchoResult", "Respuesta sintética"),
          "400": errRef("Parámetro fuera de rango"),
          ...authErrors,
        },
      },
    },
    "/api/perf/echo-limited": {
      get: {
        tags: [CARGA],
        summary: `Echo con límite bajo (${PERF_RATE_LIMITS.echoLimited.requests}/min)`,
        description:
          "Idéntico a `/api/perf/echo` pero limitado a " +
          `${PERF_RATE_LIMITS.echoLimited.requests} req/min. Es la pared de 429 en vivo: ` +
          "mirá `Retry-After`, `X-RateLimit-Remaining` y `X-RateLimit-Reset`. " +
          "Un test de carga que no cuenta los 429 miente sobre el throughput real.",
        parameters: echoParams,
        responses: {
          "200": dataOf("EchoResult", "Respuesta sintética"),
          "400": errRef("Parámetro fuera de rango"),
          ...authErrors,
        },
      },
    },
    "/api/perf/db": {
      get: {
        tags: [CARGA],
        summary: `Carga real contra Postgres (${PERF_RATE_LIMITS.dbRead.requests}/min)`,
        description:
          "Consulta `qa_training.perf_carga` (100k filas sintéticas, tabla dedicada: no toca " +
          "ni bloquea los datos del curso).\n\n" +
          "**`mode=literal` es la demo del *hard parse*.** Concatena el valor en el SQL en " +
          "vez de pasarlo como `$1`, así que **cada request crea una entrada nueva en " +
          "`pg_stat_statements`** y el contador se dispara en vivo en Grafana. " +
          "`mode=parametrizada` deja una sola entrada.\n\n" +
          "**`indexed=false`** filtra por `codigo`, columna deliberadamente sin índice: " +
          "Seq Scan sobre 100k filas en vez de Index Scan.\n\n" +
          "Ojo: correr `mode=literal` provoca evicción en `pg_stat_statements` y ensucia las " +
          "estadísticas de la instancia. Usalo solo durante la demo y después hacé " +
          "`SELECT extensions.pg_stat_statements_reset()`.",
        parameters: [
          {
            name: "mode",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["parametrizada", "literal"], default: "parametrizada" },
          },
          {
            name: "indexed",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["true", "false"], default: "true" },
          },
          {
            name: "rows",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 1, maximum: 500, default: 50 },
          },
        ],
        responses: {
          "200": dataOf("DbResult", "Filas + el SQL que se ejecutó"),
          "400": errRef("Parámetro fuera de rango"),
          ...authErrors,
        },
      },
      post: {
        tags: [CARGA],
        summary: `Escritura idempotente (${PERF_RATE_LIMITS.dbWrite.requests}/min)`,
        description:
          "Inserta en `perf_carga`. **Requiere el header `Idempotency-Key`**, a propósito: " +
          "bajo carga los reintentos son inevitables (timeout del cliente, retry del " +
          "balanceador) y sin clave de idempotencia cada reintento duplica la transacción.\n\n" +
          "Reintentar con la misma clave devuelve **200** con la respuesta original y el " +
          "header `Idempotent-Replay: true`. La primera vez devuelve **201** con " +
          "`Idempotent-Replay: false`. Dos reintentos concurrentes: el segundo recibe **409**.",
        parameters: [
          {
            name: "Idempotency-Key",
            in: "header",
            required: true,
            schema: { type: "string" },
            description: "Clave única por operación lógica (no por intento). Un UUID sirve.",
          },
        ],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  categoria: { type: "string", default: "escritura" },
                  monto: { type: "number", default: 100 },
                },
              },
            },
          },
        },
        responses: {
          "201": dataOf("DbWriteResult", "Fila creada (Idempotent-Replay: false)"),
          "200": dataOf("DbWriteResult", "Reintento con la misma clave (Idempotent-Replay: true)"),
          "400": errRef("Falta el header Idempotency-Key, o el body es inválido"),
          "409": errRef("Otra request con la misma clave está en curso"),
          ...authErrors,
        },
      },
    },
    "/api/perf/limits": {
      get: {
        tags: [INTROSPECCION],
        summary: "Techos conocidos del sistema",
        description:
          "El contrato que un QA debería **exigir antes** de diseñar una prueba de carga, " +
          "en vez de descubrirlo a mitad de la corrida: conexiones máximas de Postgres, " +
          "tamaño del pool por instancia, modo del pooler, rate limits por ruta y " +
          "conexiones vivas en este momento.",
        responses: { "200": dataOf("Limits", "Límites del sistema"), ...authErrors },
      },
    },
    "/api/perf/metrics": {
      get: {
        tags: [INTROSPECCION],
        summary: "Percentiles, tasa de error y consumo del proceso",
        description:
          "Percentiles (p50/p95/p99) y tasa de error calculados sobre `public.sql_audit_log` " +
          "— son de toda la flota. Las métricas de `proceso` (rss, heap, CPU) son solo de " +
          "**esta instancia**: en serverless no hay un pod que crezca, hay N instancias " +
          "efímeras, y por eso no se pueden sumar entre sí.\n\n" +
          "`format=prometheus` devuelve texto plano en formato de exposición, para que " +
          "Grafana Alloy lo scrapee.",
        parameters: [
          {
            name: "minutos",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 1, maximum: 1440, default: 15 },
          },
          {
            name: "format",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["json", "prometheus"], default: "json" },
          },
        ],
        responses: {
          "200": {
            description: "Métricas agregadas",
            content: {
              "application/json": {
                schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Metrics" } } },
              },
              "text/plain": { schema: { type: "string" } },
            },
          },
          ...authErrors,
        },
      },
    },
  },
} as const;

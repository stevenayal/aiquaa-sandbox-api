export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiPool, withTransaction } from "@/lib/db";
import { apiRoute, badRequest } from "@/lib/api-route";
import { INSTANCE_ID, PERF_AUDIT_SAMPLE, PERF_RATE_LIMITS } from "@/lib/perf-config";

const getSchema = z.object({
  // El corazon de la demo de "hard parse":
  //   parametrizada -> una sola entrada en pg_stat_statements, plan reutilizable
  //   literal       -> UNA ENTRADA NUEVA POR REQUEST; el contador de
  //                    pg_stat_statements se dispara en vivo en Grafana.
  mode: z.enum(["parametrizada", "literal"]).default("parametrizada"),
  // true  -> filtra por `categoria`, que tiene indice (Index Scan)
  // false -> filtra por `codigo`, deliberadamente sin indice (Seq Scan)
  indexed: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  rows: z.coerce.number().int().min(1).max(500).default(50),
});

const postSchema = z.object({
  categoria: z.string().min(1).max(60).default("escritura"),
  monto: z.coerce.number().positive().max(1_000_000).default(100),
});

interface PerfRow {
  id: number;
  categoria: string;
  codigo: string;
  monto: string;
}

// GET /api/perf/db — carga real contra qa_training.perf_carga (tabla dedicada,
// sembrada por scripts/seed-perf-data.sql). No toca ninguna tabla del curso:
// se puede estresar sin bloquear lo que los alumnos esten usando.
export const GET = apiRoute({
  inputSchema: getSchema,
  rateLimit: PERF_RATE_LIMITS.dbRead,
  auditSampleRate: PERF_AUDIT_SAMPLE.db,
  handler: async ({ mode, indexed, rows }) => {
    // El valor del filtro lo genera el servidor, no el cliente: en modo
    // `literal` se interpola en el SQL, asi que no puede venir de un
    // parametro. Son enteros generados aca — cero superficie de inyeccion.
    const semilla = Math.floor(Math.random() * 100_000) + 1;
    const columna = indexed ? "categoria" : "codigo";
    const valor = indexed ? `cat_${semilla % 100}` : `cod_${semilla}`;

    const pool = getQaApiPool();
    const startedAt = performance.now();

    let sql: string;
    let result;
    if (mode === "parametrizada") {
      sql = `SELECT id, categoria, codigo, monto FROM perf_carga WHERE ${columna} = $1 LIMIT $2`;
      result = await pool.query<PerfRow>(sql, [valor, rows]);
    } else {
      // Concatenacion a proposito: es exactamente el antipatron que la charla
      // demuestra. Cada valor distinto produce un statement distinto, y con el
      // pooler en modo transaccion tampoco hay prepared statement que reusar.
      sql = `SELECT id, categoria, codigo, monto FROM perf_carga WHERE ${columna} = '${valor}' LIMIT ${rows}`;
      result = await pool.query<PerfRow>(sql);
    }

    return {
      body: {
        data: {
          instanceId: INSTANCE_ID,
          mode,
          indexed,
          columnaFiltrada: columna,
          // El SQL ejecutado va en la respuesta a proposito: el alumno compara
          // los dos modos sin tener que entrar a la base.
          sql,
          rowCount: result.rowCount,
          dbMs: Math.round(performance.now() - startedAt),
          filas: result.rows,
        },
      },
    };
  },
});

// POST /api/perf/db — escritura idempotente. Bajo carga los reintentos son
// inevitables (timeout del cliente, retry del balanceador); sin una clave de
// idempotencia cada reintento duplica la transaccion.
export const POST = apiRoute({
  inputSchema: postSchema,
  rateLimit: PERF_RATE_LIMITS.dbWrite,
  auditSampleRate: PERF_AUDIT_SAMPLE.db,
  handler: async ({ categoria, monto }, ctx) => {
    const clave = ctx.headers.get("idempotency-key");
    if (!clave) {
      return badRequest(
        "Falta el header Idempotency-Key. Es obligatorio en este endpoint a proposito: es lo que hace que un reintento no duplique la escritura.",
      );
    }

    return withTransaction(getQaApiPool(), async (client) => {
      const yaProcesada = await client.query<{ respuesta: unknown }>(
        "SELECT respuesta FROM perf_idempotencia WHERE clave = $1",
        [clave],
      );
      if (yaProcesada.rows[0]) {
        return {
          status: 200,
          body: { data: yaProcesada.rows[0].respuesta },
          // 200 y no 201: no se creo nada en esta llamada. El header lo hace
          // explicito para que un assert de JMeter pueda distinguirlos.
          headers: { "Idempotent-Replay": "true" },
        };
      }

      const insertada = await client.query<PerfRow>(
        `INSERT INTO perf_carga (categoria, codigo, monto, payload)
         VALUES ($1, $2, $3::numeric, $4)
         RETURNING id, categoria, codigo, monto`,
        [categoria, `cod_w_${clave.slice(0, 40)}`, monto, `write:${clave}`],
      );

      const respuesta = { ...insertada.rows[0], instanceId: INSTANCE_ID };

      // Si dos reintentos concurrentes llegan a la vez, el segundo choca aca
      // contra la PK (23505) y apiRoute lo traduce a 409 — que es la respuesta
      // correcta: la operacion ya esta en curso, no se duplico nada.
      await client.query(
        "INSERT INTO perf_idempotencia (clave, respuesta) VALUES ($1, $2::jsonb)",
        [clave, JSON.stringify(respuesta)],
      );

      return {
        status: 201,
        body: { data: respuesta },
        headers: { "Idempotent-Replay": "false" },
      };
    });
  },
});

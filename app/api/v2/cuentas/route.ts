export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiV2Pool } from "@/lib/db";
import { apiRoute } from "@/lib/api-route";

const getSchema = z.object({
  usuarioId: z.coerce.number().int().positive().optional(),
  estado: z.enum(["activa", "bloqueada", "cerrada"]).optional(),
});

const postSchema = z.object({
  usuarioId: z.coerce.number().int().positive(),
  tipoCuenta: z.enum(["ahorro", "corriente"]),
  moneda: z.enum(["PYG", "USD"]),
});

// Filtros opcionales combinables sin armar SQL dinámico: los parámetros que no
// vinieron entran como NULL y el `$n IS NULL OR ...` los desactiva.
const LIST_SQL = `SELECT * FROM cuentas
   WHERE activa = true
     AND ($1::bigint IS NULL OR usuario_id = $1)
     AND ($2::text IS NULL OR estado = $2)
   ORDER BY id
   LIMIT 100`;

export const GET = apiRoute({
  curso: 2,
  inputSchema: getSchema,
  handler: async ({ usuarioId, estado }) => {
    const { rows } = await getQaApiV2Pool().query(LIST_SQL, [usuarioId ?? null, estado ?? null]);
    return { body: { data: rows } };
  },
});

// numero_cuenta es decorativo (no hay datos reales) — se genera al azar, igual
// que numero_enmascarado en tarjetas. El saldo arranca en 0: se mueve
// únicamente vía POST /cuentas/{id}/movimientos o una transferencia, para que
// el ledger de movimientos siempre explique el saldo.
export const POST = apiRoute({
  curso: 2,
  inputSchema: postSchema,
  handler: async ({ usuarioId, tipoCuenta, moneda }) => {
    const numeroCuenta = String(Math.floor(1_000_000_000 + Math.random() * 9_000_000_000));
    const { rows } = await getQaApiV2Pool().query(
      `INSERT INTO cuentas (usuario_id, numero_cuenta, tipo_cuenta, moneda)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [usuarioId, numeroCuenta, tipoCuenta, moneda],
    );
    return { status: 201, body: { data: rows[0] } };
  },
});

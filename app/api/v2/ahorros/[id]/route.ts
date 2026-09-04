export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiV2Pool } from "@/lib/db";
import { apiRoute, notFound, noContent, conflict } from "@/lib/api-route";

const idSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// saldo_acumulado y estado quedan fuera del PUT: el dinero se mueve por
// /aportar, no por un replace del plan.
const putSchema = z.object({
  id: z.coerce.number().int().positive(),
  nombreMeta: z.string().min(1),
  metaMonto: z.number().positive(),
  aporteMensual: z.number().positive(),
  tasaAnual: z.number().nonnegative().max(999.99).optional(),
});

export const GET = apiRoute({
  curso: 2,
  inputSchema: idSchema,
  handler: async ({ id }) => {
    const { rows } = await getQaApiV2Pool().query(
      `SELECT *, (meta_monto - saldo_acumulado) AS falta_para_meta
         FROM ahorros WHERE id = $1 AND activo = true`,
      [id],
    );
    if (!rows[0]) return notFound("Plan de ahorro no encontrado.");
    return { body: { data: rows[0] } };
  },
});

export const PUT = apiRoute({
  curso: 2,
  inputSchema: putSchema,
  handler: async ({ id, nombreMeta, metaMonto, aporteMensual, tasaAnual }) => {
    const pool = getQaApiV2Pool();
    const { rows } = await pool.query(
      "SELECT id, estado, saldo_acumulado FROM ahorros WHERE id = $1 AND activo = true",
      [id],
    );
    const ahorro = rows[0];
    if (!ahorro) return notFound("Plan de ahorro no encontrado.");
    if (ahorro.estado !== "activo") {
      return conflict(`Un plan '${ahorro.estado}' ya no puede modificarse.`);
    }
    if (metaMonto < Number(ahorro.saldo_acumulado)) {
      return conflict("La meta no puede ser menor al saldo ya acumulado.");
    }

    const { rows: updated } = await pool.query(
      `UPDATE ahorros
          SET nombre_meta = $1, meta_monto = $2, aporte_mensual = $3, tasa_anual = $4
        WHERE id = $5
        RETURNING *, (meta_monto - saldo_acumulado) AS falta_para_meta`,
      [nombreMeta, metaMonto, aporteMensual, tasaAnual ?? 0, id],
    );
    return { body: { data: updated[0] } };
  },
});

export const DELETE = apiRoute({
  curso: 2,
  inputSchema: idSchema,
  handler: async ({ id }) => {
    const { rows } = await getQaApiV2Pool().query(
      "UPDATE ahorros SET activo = false WHERE id = $1 AND activo = true RETURNING id",
      [id],
    );
    if (!rows[0]) return notFound("Plan de ahorro no encontrado.");
    return noContent();
  },
});

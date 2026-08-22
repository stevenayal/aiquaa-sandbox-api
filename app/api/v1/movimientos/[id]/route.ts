export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiPool } from "@/lib/db";
import { apiRoute, notFound, noContent } from "@/lib/api-route";

const getSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const putSchema = z.object({
  id: z.coerce.number().int().positive(),
  tipoMovimiento: z.enum(["transferencia", "pago_factura", "compra_ecommerce", "cargo_tarjeta"]),
  monto: z.coerce.number().positive(),
  referenciaId: z.coerce.number().int().positive().optional(),
  descripcion: z.string().optional(),
});

export const GET = apiRoute({
  inputSchema: getSchema,
  handler: async ({ id }) => {
    const pool = getQaApiPool();
    const { rows } = await pool.query(
      "SELECT * FROM movimientos WHERE id = $1 AND activo = true",
      [id],
    );
    if (!rows[0]) return notFound("Movimiento no encontrado.");
    return { body: { data: rows[0] } };
  },
});

export const PUT = apiRoute({
  inputSchema: putSchema,
  handler: async ({ id, tipoMovimiento, monto, referenciaId, descripcion }) => {
    const pool = getQaApiPool();
    const { rows } = await pool.query(
      `UPDATE movimientos SET tipo_movimiento = $1, monto = $2, referencia_id = $3, descripcion = $4
       WHERE id = $5 AND activo = true
       RETURNING *`,
      [tipoMovimiento, monto, referenciaId ?? null, descripcion ?? null, id],
    );
    if (!rows[0]) return notFound("Movimiento no encontrado.");
    return { body: { data: rows[0] } };
  },
});

export const DELETE = apiRoute({
  inputSchema: getSchema,
  handler: async ({ id }) => {
    const pool = getQaApiPool();
    const { rows } = await pool.query(
      "UPDATE movimientos SET activo = false WHERE id = $1 AND activo = true RETURNING id",
      [id],
    );
    if (!rows[0]) return notFound("Movimiento no encontrado.");
    return noContent();
  },
});

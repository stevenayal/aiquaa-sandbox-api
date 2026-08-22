export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiPool } from "@/lib/db";
import { apiRoute, notFound, noContent } from "@/lib/api-route";

const getSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// estado no está en este PUT: no hay endpoint PATCH de estado para
// transferencias todavía, así que estado sigue en 'pendiente' vía DEFAULT y
// solo se puede desactivar (soft-delete) vía DELETE, nunca reemplazar acá.
const putSchema = z.object({
  id: z.coerce.number().int().positive(),
  cuentaOrigenId: z.coerce.number().int().positive(),
  cuentaDestinoId: z.coerce.number().int().positive(),
  monto: z.coerce.number().positive(),
  descripcion: z.string().optional(),
});

export const GET = apiRoute({
  inputSchema: getSchema,
  handler: async ({ id }) => {
    const pool = getQaApiPool();
    const { rows } = await pool.query(
      "SELECT * FROM transferencias WHERE id = $1 AND activo = true",
      [id],
    );
    if (!rows[0]) return notFound("Transferencia no encontrada.");
    return { body: { data: rows[0] } };
  },
});

export const PUT = apiRoute({
  inputSchema: putSchema,
  handler: async ({ id, cuentaOrigenId, cuentaDestinoId, monto, descripcion }) => {
    const pool = getQaApiPool();
    const { rows } = await pool.query(
      `UPDATE transferencias
       SET cuenta_origen_id = $1, cuenta_destino_id = $2, monto = $3, descripcion = $4
       WHERE id = $5 AND activo = true
       RETURNING *`,
      [cuentaOrigenId, cuentaDestinoId, monto, descripcion ?? null, id],
    );
    if (!rows[0]) return notFound("Transferencia no encontrada.");
    return { body: { data: rows[0] } };
  },
});

export const DELETE = apiRoute({
  inputSchema: getSchema,
  handler: async ({ id }) => {
    const pool = getQaApiPool();
    const { rows } = await pool.query(
      "UPDATE transferencias SET activo = false WHERE id = $1 AND activo = true RETURNING id",
      [id],
    );
    if (!rows[0]) return notFound("Transferencia no encontrada.");
    return noContent();
  },
});

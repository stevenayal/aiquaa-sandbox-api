export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiPool } from "@/lib/db";
import { apiRoute, notFound, noContent } from "@/lib/api-route";

const getSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const itemSchema = z.object({
  producto: z.string().min(1),
  cantidad: z.number().int().positive(),
  precioUnitario: z.number().positive(),
});

// Recalcula producto/monto a partir de los items enviados, igual que el
// POST. IMPORTANTE: no toca las filas existentes de items_orden — qa_api no
// tiene GRANT de DELETE, así que no hay forma de reemplazarlas sin dejar
// filas huérfanas; items_orden queda como historial append-only y este PUT
// solo reemplaza los campos propios de la orden (producto, monto).
const putSchema = z.object({
  id: z.coerce.number().int().positive(),
  items: z.array(itemSchema).min(1),
});

export const GET = apiRoute({
  inputSchema: getSchema,
  handler: async ({ id }) => {
    const pool = getQaApiPool();
    const { rows: ordenRows } = await pool.query(
      "SELECT * FROM ordenes WHERE id = $1 AND activo = true",
      [id],
    );
    const orden = ordenRows[0];
    if (!orden) return notFound("Orden no encontrada.");
    const { rows: items } = await pool.query(
      "SELECT * FROM items_orden WHERE orden_id = $1 ORDER BY id",
      [id],
    );
    return { body: { data: { ...orden, items } } };
  },
});

export const PUT = apiRoute({
  inputSchema: putSchema,
  handler: async ({ id, items }) => {
    const pool = getQaApiPool();
    const monto = items.reduce((sum, item) => sum + item.cantidad * item.precioUnitario, 0);
    const { rows } = await pool.query(
      `UPDATE ordenes SET producto = $1, monto = $2
       WHERE id = $3 AND activo = true
       RETURNING *`,
      [items[0].producto, monto, id],
    );
    if (!rows[0]) return notFound("Orden no encontrada.");
    return { body: { data: rows[0] } };
  },
});

export const DELETE = apiRoute({
  inputSchema: getSchema,
  handler: async ({ id }) => {
    const pool = getQaApiPool();
    const { rows } = await pool.query(
      "UPDATE ordenes SET activo = false WHERE id = $1 AND activo = true RETURNING id",
      [id],
    );
    if (!rows[0]) return notFound("Orden no encontrada.");
    return noContent();
  },
});

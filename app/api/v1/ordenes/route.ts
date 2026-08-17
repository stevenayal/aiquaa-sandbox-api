export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiPool, withTransaction } from "@/lib/db";
import { apiRoute } from "@/lib/api-route";

const getSchema = z.object({
  usuarioId: z.coerce.number().int().positive().optional(),
});

const itemSchema = z.object({
  producto: z.string().min(1),
  cantidad: z.number().int().positive(),
  precioUnitario: z.number().positive(),
});

const postSchema = z.object({
  usuarioId: z.coerce.number().int().positive(),
  items: z.array(itemSchema).min(1),
});

export const GET = apiRoute({
  inputSchema: getSchema,
  handler: async ({ usuarioId }) => {
    const pool = getQaApiPool();
    const { rows } = usuarioId
      ? await pool.query("SELECT * FROM ordenes WHERE usuario_id = $1 ORDER BY id", [usuarioId])
      : await pool.query("SELECT * FROM ordenes ORDER BY id LIMIT 100");
    return { body: { data: rows } };
  },
});

// El monto/subtotal se calcula server-side, nunca se confía en un total
// mandado por el body. producto de la orden = el primer item, mismo
// criterio que ya usa scripts/seed-data.sql.
export const POST = apiRoute({
  inputSchema: postSchema,
  handler: async ({ usuarioId, items }) => {
    return withTransaction(getQaApiPool(), async (client) => {
      const monto = items.reduce((sum, item) => sum + item.cantidad * item.precioUnitario, 0);
      const { rows: ordenRows } = await client.query(
        `INSERT INTO ordenes (usuario_id, producto, monto, estado)
         VALUES ($1, $2, $3, 'pendiente') RETURNING *`,
        [usuarioId, items[0].producto, monto],
      );
      const orden = ordenRows[0];

      const insertedItems = [];
      for (const item of items) {
        const subtotal = item.cantidad * item.precioUnitario;
        const { rows } = await client.query(
          `INSERT INTO items_orden (orden_id, producto, cantidad, precio_unitario, subtotal)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [orden.id, item.producto, item.cantidad, item.precioUnitario, subtotal],
        );
        insertedItems.push(rows[0]);
      }

      return { status: 201, body: { data: { ...orden, items: insertedItems } } };
    });
  },
});

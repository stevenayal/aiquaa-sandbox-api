export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiPool } from "@/lib/db";
import { apiRoute, notFound } from "@/lib/api-route";

const schema = z.object({
  id: z.coerce.number().int().positive(),
});

export const GET = apiRoute({
  inputSchema: schema,
  handler: async ({ id }) => {
    const pool = getQaApiPool();
    const { rows: ordenRows } = await pool.query("SELECT * FROM ordenes WHERE id = $1", [id]);
    const orden = ordenRows[0];
    if (!orden) return notFound("Orden no encontrada.");
    const { rows: items } = await pool.query(
      "SELECT * FROM items_orden WHERE orden_id = $1 ORDER BY id",
      [id],
    );
    return { body: { data: { ...orden, items } } };
  },
});

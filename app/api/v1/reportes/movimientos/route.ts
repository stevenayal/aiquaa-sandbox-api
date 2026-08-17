export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiPool } from "@/lib/db";
import { apiRoute } from "@/lib/api-route";

const schema = z.object({
  usuarioId: z.coerce.number().int().positive().optional(),
  desde: z.string().optional(),
  hasta: z.string().optional(),
});

export const GET = apiRoute({
  inputSchema: schema,
  handler: async ({ usuarioId, desde, hasta }) => {
    const pool = getQaApiPool();
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (usuarioId !== undefined) {
      params.push(usuarioId);
      conditions.push(`usuario_id = $${params.length}`);
    }
    if (desde !== undefined) {
      params.push(desde);
      conditions.push(`created_at >= $${params.length}`);
    }
    if (hasta !== undefined) {
      params.push(hasta);
      conditions.push(`created_at <= $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const { rows } = await pool.query(
      `SELECT tipo_movimiento, COUNT(*)::int AS cantidad, SUM(monto) AS total
       FROM movimientos
       ${where}
       GROUP BY tipo_movimiento
       ORDER BY tipo_movimiento`,
      params,
    );
    return { body: { data: rows } };
  },
});

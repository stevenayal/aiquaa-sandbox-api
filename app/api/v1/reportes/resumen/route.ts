export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiPool } from "@/lib/db";
import { apiRoute } from "@/lib/api-route";

const schema = z.object({
  usuarioId: z.coerce.number().int().positive().optional(),
});

export const GET = apiRoute({
  inputSchema: schema,
  handler: async ({ usuarioId }) => {
    const pool = getQaApiPool();
    const where = usuarioId !== undefined ? "WHERE usuario_id = $1" : "";
    const params = usuarioId !== undefined ? [usuarioId] : [];
    const { rows } = await pool.query(
      `SELECT
         COUNT(*)::int AS cantidad_movimientos,
         COALESCE(SUM(monto), 0) AS total,
         MIN(created_at) AS primero,
         MAX(created_at) AS ultimo
       FROM movimientos
       ${where}`,
      params,
    );
    return { body: { data: rows[0] } };
  },
});

export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiPool } from "@/lib/db";
import { apiRoute } from "@/lib/api-route";

const schema = z.object({
  usuarioId: z.coerce.number().int().positive().optional(),
  estado: z.enum(["pendiente", "pagada", "vencida"]).optional(),
});

export const GET = apiRoute({
  inputSchema: schema,
  handler: async ({ usuarioId, estado }) => {
    const pool = getQaApiPool();
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (usuarioId !== undefined) {
      params.push(usuarioId);
      conditions.push(`usuario_id = $${params.length}`);
    }
    if (estado !== undefined) {
      params.push(estado);
      conditions.push(`estado = $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const { rows } = await pool.query(
      `SELECT * FROM facturas ${where} ORDER BY id LIMIT 100`,
      params,
    );
    return { body: { data: rows } };
  },
});

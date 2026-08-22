export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiPool } from "@/lib/db";
import { apiRoute } from "@/lib/api-route";

const getSchema = z.object({
  usuarioId: z.coerce.number().int().positive().optional(),
});

const postSchema = z.object({
  usuarioId: z.coerce.number().int().positive(),
  servicio: z.string().min(1),
  fechaHora: z.string().datetime({ offset: true }).or(z.string().min(1)),
  notas: z.string().optional(),
});

export const GET = apiRoute({
  inputSchema: getSchema,
  handler: async ({ usuarioId }) => {
    const pool = getQaApiPool();
    const { rows } = usuarioId
      ? await pool.query(
          "SELECT * FROM reservas WHERE usuario_id = $1 AND activo = true ORDER BY id",
          [usuarioId],
        )
      : await pool.query("SELECT * FROM reservas WHERE activo = true ORDER BY id LIMIT 100");
    return { body: { data: rows } };
  },
});

export const POST = apiRoute({
  inputSchema: postSchema,
  handler: async ({ usuarioId, servicio, fechaHora, notas }) => {
    const pool = getQaApiPool();
    const { rows } = await pool.query(
      `INSERT INTO reservas (usuario_id, servicio, fecha_hora, notas, estado)
       VALUES ($1, $2, $3, $4, 'pendiente') RETURNING *`,
      [usuarioId, servicio, fechaHora, notas ?? null],
    );
    return { status: 201, body: { data: rows[0] } };
  },
});

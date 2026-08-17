export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiPool } from "@/lib/db";
import { apiRoute, notFound } from "@/lib/api-route";

const schema = z.object({
  usuarioId: z.coerce.number().int().positive(),
});

export const POST = apiRoute({
  inputSchema: schema,
  handler: async ({ usuarioId }, ctx) => {
    const pool = getQaApiPool();
    const { rows } = await pool.query("SELECT id FROM usuarios WHERE id = $1", [usuarioId]);
    if (!rows[0]) return notFound("Usuario no encontrado.");
    const { rows: sesionRows } = await pool.query(
      "INSERT INTO sesiones (usuario_id, tipo_evento, exitoso, ip) VALUES ($1, 'password_reset_completado', true, $2) RETURNING *",
      [usuarioId, ctx.ip],
    );
    return { body: { data: sesionRows[0] } };
  },
});

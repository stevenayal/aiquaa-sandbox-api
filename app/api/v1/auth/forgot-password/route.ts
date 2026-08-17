export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiPool } from "@/lib/db";
import { apiRoute, notFound } from "@/lib/api-route";

const schema = z.object({
  email: z.string().email(),
});

export const POST = apiRoute({
  inputSchema: schema,
  handler: async ({ email }, ctx) => {
    const pool = getQaApiPool();
    const { rows } = await pool.query("SELECT id FROM usuarios WHERE email = $1", [email]);
    const usuario = rows[0];
    if (!usuario) return notFound("Usuario no encontrado.");
    const { rows: sesionRows } = await pool.query(
      "INSERT INTO sesiones (usuario_id, tipo_evento, exitoso, ip) VALUES ($1, 'password_reset_solicitado', true, $2) RETURNING *",
      [usuario.id, ctx.ip],
    );
    return { body: { data: sesionRows[0] } };
  },
});

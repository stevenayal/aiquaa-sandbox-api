export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiPool } from "@/lib/db";
import { apiRoute, notFound } from "@/lib/api-route";

const schema = z.object({
  id: z.coerce.number().int().positive(),
  roleId: z.coerce.number().int().positive(),
});

// Soft-revoke: qa_api no tiene GRANT de DELETE en ninguna tabla, a
// propósito, así que "borrar" acá es marcar activo=false.
export const DELETE = apiRoute({
  inputSchema: schema,
  handler: async ({ id, roleId }) => {
    const pool = getQaApiPool();
    const { rows } = await pool.query(
      `UPDATE usuario_roles SET activo = false
       WHERE usuario_id = $1 AND role_id = $2
       RETURNING *`,
      [id, roleId],
    );
    if (!rows[0]) return notFound("Asignación de rol no encontrada.");
    return { body: { data: rows[0] } };
  },
});

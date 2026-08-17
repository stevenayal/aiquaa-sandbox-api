export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiPool } from "@/lib/db";
import { apiRoute } from "@/lib/api-route";

const getSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const postSchema = z.object({
  id: z.coerce.number().int().positive(),
  roleId: z.coerce.number().int().positive(),
});

export const GET = apiRoute({
  inputSchema: getSchema,
  handler: async ({ id }) => {
    const pool = getQaApiPool();
    const { rows } = await pool.query(
      `SELECT ur.id, ur.usuario_id, ur.role_id, ur.activo, ur.asignado_en, r.nombre, r.descripcion
       FROM usuario_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.usuario_id = $1 AND ur.activo = true
       ORDER BY ur.id`,
      [id],
    );
    return { body: { data: rows } };
  },
});

// UPSERT, no INSERT bare: usuario_roles tiene UNIQUE(usuario_id, role_id),
// así que un alumno que revoca un rol (DELETE, activo=false) y lo vuelve a
// asignar necesita reactivar la fila existente, no chocar con la unique.
export const POST = apiRoute({
  inputSchema: postSchema,
  handler: async ({ id, roleId }) => {
    const pool = getQaApiPool();
    const { rows } = await pool.query(
      `INSERT INTO usuario_roles (usuario_id, role_id, activo)
       VALUES ($1, $2, true)
       ON CONFLICT (usuario_id, role_id) DO UPDATE SET activo = true
       RETURNING *`,
      [id, roleId],
    );
    return { status: 201, body: { data: rows[0] } };
  },
});

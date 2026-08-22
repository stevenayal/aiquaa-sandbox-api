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
// `xmax = 0` es el truco estándar de Postgres para distinguir, en el
// RETURNING de un INSERT ... ON CONFLICT DO UPDATE, si la fila se insertó
// (xmax = 0) o se actualizó (xmax != 0) — así el status code respeta RFC
// 7231: 201 solo cuando de verdad se creó un recurso nuevo, 200 cuando el
// upsert reactivó uno existente.
export const POST = apiRoute({
  inputSchema: postSchema,
  handler: async ({ id, roleId }) => {
    const pool = getQaApiPool();
    const { rows } = await pool.query(
      `INSERT INTO usuario_roles (usuario_id, role_id, activo)
       VALUES ($1, $2, true)
       ON CONFLICT (usuario_id, role_id) DO UPDATE SET activo = true
       RETURNING *, (xmax = 0) AS inserted`,
      [id, roleId],
    );
    const { inserted, ...row } = rows[0];
    return { status: inserted ? 201 : 200, body: { data: row } };
  },
});

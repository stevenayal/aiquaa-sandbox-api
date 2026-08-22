export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiPool } from "@/lib/db";
import { apiRoute, notFound, noContent } from "@/lib/api-route";

const getSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const putSchema = z.object({
  id: z.coerce.number().int().positive(),
  nombre: z.enum(["admin", "soporte", "auditor", "operador"]),
  descripcion: z.string().optional(),
});

export const GET = apiRoute({
  inputSchema: getSchema,
  handler: async ({ id }) => {
    const pool = getQaApiPool();
    const { rows } = await pool.query(
      "SELECT * FROM roles WHERE id = $1 AND activo = true",
      [id],
    );
    if (!rows[0]) return notFound("Rol no encontrado.");
    return { body: { data: rows[0] } };
  },
});

export const PUT = apiRoute({
  inputSchema: putSchema,
  handler: async ({ id, nombre, descripcion }) => {
    const pool = getQaApiPool();
    const { rows } = await pool.query(
      `UPDATE roles SET nombre = $1, descripcion = $2
       WHERE id = $3 AND activo = true
       RETURNING *`,
      [nombre, descripcion ?? null, id],
    );
    if (!rows[0]) return notFound("Rol no encontrado.");
    return { body: { data: rows[0] } };
  },
});

export const DELETE = apiRoute({
  inputSchema: getSchema,
  handler: async ({ id }) => {
    const pool = getQaApiPool();
    const { rows } = await pool.query(
      "UPDATE roles SET activo = false WHERE id = $1 AND activo = true RETURNING id",
      [id],
    );
    if (!rows[0]) return notFound("Rol no encontrado.");
    return noContent();
  },
});

export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiPool } from "@/lib/db";
import { apiRoute, notFound, noContent } from "@/lib/api-route";

const getSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const putSchema = z.object({
  id: z.coerce.number().int().positive(),
  nombre: z.string().min(1),
  email: z.string().email(),
  documentoTipo: z.enum(["CI", "pasaporte", "RUC"]),
  documentoNumero: z.string().min(1),
  fechaNacimiento: z.string().optional(),
  direccion: z.string().optional(),
});

export const GET = apiRoute({
  inputSchema: getSchema,
  handler: async ({ id }) => {
    const pool = getQaApiPool();
    const { rows } = await pool.query(
      "SELECT * FROM usuarios WHERE id = $1 AND activo = true",
      [id],
    );
    if (!rows[0]) return notFound("Usuario no encontrado.");
    return { body: { data: rows[0] } };
  },
});

// Full replace de los campos de negocio únicamente — kyc_estado sigue
// gobernado por PATCH /usuarios/{id}/kyc y activo por este mismo DELETE,
// nunca por PUT, para no pisar esos endpoints dedicados.
export const PUT = apiRoute({
  inputSchema: putSchema,
  handler: async ({ id, nombre, email, documentoTipo, documentoNumero, fechaNacimiento, direccion }) => {
    const pool = getQaApiPool();
    const { rows } = await pool.query(
      `UPDATE usuarios
       SET nombre = $1, email = $2, documento_tipo = $3, documento_numero = $4,
           fecha_nacimiento = $5, direccion = $6
       WHERE id = $7 AND activo = true
       RETURNING *`,
      [nombre, email, documentoTipo, documentoNumero, fechaNacimiento ?? null, direccion ?? null, id],
    );
    if (!rows[0]) return notFound("Usuario no encontrado.");
    return { body: { data: rows[0] } };
  },
});

export const DELETE = apiRoute({
  inputSchema: getSchema,
  handler: async ({ id }) => {
    const pool = getQaApiPool();
    const { rows } = await pool.query(
      "UPDATE usuarios SET activo = false WHERE id = $1 AND activo = true RETURNING id",
      [id],
    );
    if (!rows[0]) return notFound("Usuario no encontrado.");
    return noContent();
  },
});

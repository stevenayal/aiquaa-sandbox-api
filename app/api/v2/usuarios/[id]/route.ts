export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiV2Pool } from "@/lib/db";
import { apiRoute, notFound, noContent } from "@/lib/api-route";

const idSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// documento_numero queda fuera del PUT: es la identidad del cliente, no un
// atributo editable (mismo criterio que numero_cuenta en cuentas).
const putSchema = z.object({
  id: z.coerce.number().int().positive(),
  nombre: z.string().min(1),
  email: z.string().email(),
  telefono: z.string().optional(),
});

export const GET = apiRoute({
  curso: 2,
  inputSchema: idSchema,
  handler: async ({ id }) => {
    const pool = getQaApiV2Pool();
    const { rows } = await pool.query(
      "SELECT * FROM usuarios WHERE id = $1 AND activo = true",
      [id],
    );
    if (!rows[0]) return notFound("Usuario no encontrado.");
    return { body: { data: rows[0] } };
  },
});

export const PUT = apiRoute({
  curso: 2,
  inputSchema: putSchema,
  handler: async ({ id, nombre, email, telefono }) => {
    const pool = getQaApiV2Pool();
    const { rows } = await pool.query(
      `UPDATE usuarios SET nombre = $1, email = $2, telefono = $3
       WHERE id = $4 AND activo = true
       RETURNING *`,
      [nombre, email, telefono ?? null, id],
    );
    if (!rows[0]) return notFound("Usuario no encontrado.");
    return { body: { data: rows[0] } };
  },
});

export const DELETE = apiRoute({
  curso: 2,
  inputSchema: idSchema,
  handler: async ({ id }) => {
    const pool = getQaApiV2Pool();
    const { rows } = await pool.query(
      "UPDATE usuarios SET activo = false WHERE id = $1 AND activo = true RETURNING id",
      [id],
    );
    if (!rows[0]) return notFound("Usuario no encontrado.");
    return noContent();
  },
});

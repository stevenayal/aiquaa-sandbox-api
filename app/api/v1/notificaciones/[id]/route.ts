export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiPool } from "@/lib/db";
import { apiRoute, notFound, noContent } from "@/lib/api-route";

const getSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// leido y estado quedan fuera del PUT — leido sigue gobernado exclusivamente
// por PATCH .../leer.
const putSchema = z.object({
  id: z.coerce.number().int().positive(),
  canal: z.enum(["push", "email", "sms"]),
  asunto: z.string().min(1),
  mensaje: z.string().min(1),
});

export const GET = apiRoute({
  inputSchema: getSchema,
  handler: async ({ id }) => {
    const pool = getQaApiPool();
    const { rows } = await pool.query(
      "SELECT * FROM notificaciones WHERE id = $1 AND activo = true",
      [id],
    );
    if (!rows[0]) return notFound("Notificación no encontrada.");
    return { body: { data: rows[0] } };
  },
});

export const PUT = apiRoute({
  inputSchema: putSchema,
  handler: async ({ id, canal, asunto, mensaje }) => {
    const pool = getQaApiPool();
    const { rows } = await pool.query(
      `UPDATE notificaciones SET canal = $1, asunto = $2, mensaje = $3
       WHERE id = $4 AND activo = true
       RETURNING *`,
      [canal, asunto, mensaje, id],
    );
    if (!rows[0]) return notFound("Notificación no encontrada.");
    return { body: { data: rows[0] } };
  },
});

export const DELETE = apiRoute({
  inputSchema: getSchema,
  handler: async ({ id }) => {
    const pool = getQaApiPool();
    const { rows } = await pool.query(
      "UPDATE notificaciones SET activo = false WHERE id = $1 AND activo = true RETURNING id",
      [id],
    );
    if (!rows[0]) return notFound("Notificación no encontrada.");
    return noContent();
  },
});

export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiPool } from "@/lib/db";
import { apiRoute, notFound, noContent } from "@/lib/api-route";

const getSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// Un evento de sesión es esencialmente un log — usuarioId, tipoEvento y
// exitoso quedan fijos al crearse, así que PUT solo permite reemplazar los
// metadatos de contexto (ip, userAgent), nunca el contenido del evento.
const putSchema = z.object({
  id: z.coerce.number().int().positive(),
  ip: z.string().optional(),
  userAgent: z.string().optional(),
});

export const GET = apiRoute({
  inputSchema: getSchema,
  handler: async ({ id }) => {
    const pool = getQaApiPool();
    const { rows } = await pool.query(
      "SELECT * FROM sesiones WHERE id = $1 AND activo = true",
      [id],
    );
    if (!rows[0]) return notFound("Sesión no encontrada.");
    return { body: { data: rows[0] } };
  },
});

export const PUT = apiRoute({
  inputSchema: putSchema,
  handler: async ({ id, ip, userAgent }) => {
    const pool = getQaApiPool();
    const { rows } = await pool.query(
      `UPDATE sesiones SET ip = $1, user_agent = $2 WHERE id = $3 AND activo = true RETURNING *`,
      [ip ?? null, userAgent ?? null, id],
    );
    if (!rows[0]) return notFound("Sesión no encontrada.");
    return { body: { data: rows[0] } };
  },
});

export const DELETE = apiRoute({
  inputSchema: getSchema,
  handler: async ({ id }) => {
    const pool = getQaApiPool();
    const { rows } = await pool.query(
      "UPDATE sesiones SET activo = false WHERE id = $1 AND activo = true RETURNING id",
      [id],
    );
    if (!rows[0]) return notFound("Sesión no encontrada.");
    return noContent();
  },
});

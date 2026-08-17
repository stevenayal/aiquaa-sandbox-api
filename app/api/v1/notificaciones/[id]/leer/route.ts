export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiPool } from "@/lib/db";
import { apiRoute, notFound } from "@/lib/api-route";

const schema = z.object({
  id: z.coerce.number().int().positive(),
});

export const PATCH = apiRoute({
  inputSchema: schema,
  handler: async ({ id }) => {
    const pool = getQaApiPool();
    const { rows } = await pool.query(
      "UPDATE notificaciones SET leido = true WHERE id = $1 RETURNING *",
      [id],
    );
    if (!rows[0]) return notFound("Notificación no encontrada.");
    return { body: { data: rows[0] } };
  },
});

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
      "UPDATE reservas SET estado = 'cancelada' WHERE id = $1 RETURNING *",
      [id],
    );
    if (!rows[0]) return notFound("Reserva no encontrada.");
    return { body: { data: rows[0] } };
  },
});

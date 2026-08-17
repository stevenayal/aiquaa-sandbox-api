export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiPool } from "@/lib/db";
import { apiRoute, notFound } from "@/lib/api-route";

const schema = z.object({
  id: z.coerce.number().int().positive(),
  kycEstado: z.enum(["pendiente", "verificado", "rechazado"]),
});

export const PATCH = apiRoute({
  inputSchema: schema,
  handler: async ({ id, kycEstado }) => {
    const pool = getQaApiPool();
    const { rows } = await pool.query(
      "UPDATE usuarios SET kyc_estado = $1 WHERE id = $2 RETURNING *",
      [kycEstado, id],
    );
    if (!rows[0]) return notFound("Usuario no encontrado.");
    return { body: { data: rows[0] } };
  },
});

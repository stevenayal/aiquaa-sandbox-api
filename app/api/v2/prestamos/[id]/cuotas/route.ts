export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiV2Pool } from "@/lib/db";
import { apiRoute, notFound } from "@/lib/api-route";

const schema = z.object({
  id: z.coerce.number().int().positive(),
  estado: z.enum(["pendiente", "pagada", "vencida"]).optional(),
});

export const GET = apiRoute({
  curso: 2,
  inputSchema: schema,
  handler: async ({ id, estado }) => {
    const pool = getQaApiV2Pool();
    const { rows: prestamoRows } = await pool.query(
      "SELECT id FROM prestamos WHERE id = $1 AND activo = true",
      [id],
    );
    if (!prestamoRows[0]) return notFound("Préstamo no encontrado.");

    const { rows } = await pool.query(
      `SELECT * FROM cuotas_prestamo
        WHERE prestamo_id = $1 AND ($2::text IS NULL OR estado = $2)
        ORDER BY numero_cuota`,
      [id, estado ?? null],
    );
    return { body: { data: rows } };
  },
});

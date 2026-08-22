export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiPool } from "@/lib/db";
import { apiRoute, notFound, noContent } from "@/lib/api-route";

const getSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// estado queda fuera del PUT — sigue gobernado exclusivamente por PATCH
// .../confirmar y .../cancelar.
const putSchema = z.object({
  id: z.coerce.number().int().positive(),
  servicio: z.string().min(1),
  fechaHora: z.string().datetime({ offset: true }).or(z.string().min(1)),
  notas: z.string().optional(),
});

export const GET = apiRoute({
  inputSchema: getSchema,
  handler: async ({ id }) => {
    const pool = getQaApiPool();
    const { rows } = await pool.query(
      "SELECT * FROM reservas WHERE id = $1 AND activo = true",
      [id],
    );
    if (!rows[0]) return notFound("Reserva no encontrada.");
    return { body: { data: rows[0] } };
  },
});

export const PUT = apiRoute({
  inputSchema: putSchema,
  handler: async ({ id, servicio, fechaHora, notas }) => {
    const pool = getQaApiPool();
    const { rows } = await pool.query(
      `UPDATE reservas SET servicio = $1, fecha_hora = $2, notas = $3
       WHERE id = $4 AND activo = true
       RETURNING *`,
      [servicio, fechaHora, notas ?? null, id],
    );
    if (!rows[0]) return notFound("Reserva no encontrada.");
    return { body: { data: rows[0] } };
  },
});

export const DELETE = apiRoute({
  inputSchema: getSchema,
  handler: async ({ id }) => {
    const pool = getQaApiPool();
    const { rows } = await pool.query(
      "UPDATE reservas SET activo = false WHERE id = $1 AND activo = true RETURNING id",
      [id],
    );
    if (!rows[0]) return notFound("Reserva no encontrada.");
    return noContent();
  },
});

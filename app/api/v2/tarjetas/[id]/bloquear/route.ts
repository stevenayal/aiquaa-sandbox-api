export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiV2Pool } from "@/lib/db";
import { apiRoute, notFound, conflict } from "@/lib/api-route";

const schema = z.object({
  id: z.coerce.number().int().positive(),
  motivo: z.string().optional(),
});

// Bloquear es idempotente en el resultado pero no en el status: una tarjeta ya
// bloqueada devuelve 409, para que el test pueda distinguir "la bloqueé yo" de
// "ya estaba bloqueada". Una tarjeta vencida no se puede bloquear.
export const POST = apiRoute({
  curso: 2,
  inputSchema: schema,
  handler: async ({ id }) => {
    const pool = getQaApiV2Pool();
    const { rows } = await pool.query(
      "SELECT id, estado FROM tarjetas WHERE id = $1 AND activo = true",
      [id],
    );
    const tarjeta = rows[0];
    if (!tarjeta) return notFound("Tarjeta no encontrada.");
    if (tarjeta.estado === "bloqueada") return conflict("La tarjeta ya está bloqueada.");
    if (tarjeta.estado === "vencida") return conflict("Una tarjeta vencida no puede bloquearse.");

    const { rows: updated } = await pool.query(
      `UPDATE tarjetas SET estado = 'bloqueada' WHERE id = $1
        RETURNING *, (limite_credito - saldo_utilizado) AS disponible`,
      [id],
    );
    return { body: { data: updated[0] } };
  },
});

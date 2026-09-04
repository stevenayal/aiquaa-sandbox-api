export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiV2Pool } from "@/lib/db";
import { apiRoute, notFound, conflict } from "@/lib/api-route";

const schema = z.object({
  id: z.coerce.number().int().positive(),
});

// Solo se reactiva una tarjeta bloqueada y no vencida: la fecha de
// vencimiento se chequea contra current_date en el UPDATE mismo.
export const POST = apiRoute({
  curso: 2,
  inputSchema: schema,
  handler: async ({ id }) => {
    const pool = getQaApiV2Pool();
    const { rows } = await pool.query(
      "SELECT id, estado, fecha_vencimiento FROM tarjetas WHERE id = $1 AND activo = true",
      [id],
    );
    const tarjeta = rows[0];
    if (!tarjeta) return notFound("Tarjeta no encontrada.");
    if (tarjeta.estado === "activa") return conflict("La tarjeta ya está activa.");
    if (tarjeta.estado === "vencida") return conflict("Una tarjeta vencida no puede activarse.");

    const { rows: updated } = await pool.query(
      `UPDATE tarjetas SET estado = 'activa'
        WHERE id = $1 AND fecha_vencimiento >= current_date
        RETURNING *, (limite_credito - saldo_utilizado) AS disponible`,
      [id],
    );
    if (!updated[0]) {
      return conflict("La tarjeta está vencida: no puede activarse.");
    }
    return { body: { data: updated[0] } };
  },
});

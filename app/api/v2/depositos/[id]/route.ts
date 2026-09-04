export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiV2Pool } from "@/lib/db";
import { apiRoute, notFound } from "@/lib/api-route";

const schema = z.object({
  id: z.coerce.number().int().positive(),
});

// Sin PUT ni DELETE: las condiciones de un plazo fijo son inmutables una vez
// constituido. Para deshacerlo está POST /depositos/{id}/cancelar.
export const GET = apiRoute({
  curso: 2,
  inputSchema: schema,
  handler: async ({ id }) => {
    const { rows } = await getQaApiV2Pool().query(
      `SELECT *,
              round(monto * tasa_anual / 100 * plazo_dias / 365.0, 2) AS interes_proyectado,
              (fecha_vencimiento - current_date) AS dias_restantes
         FROM depositos
        WHERE id = $1 AND activo = true`,
      [id],
    );
    if (!rows[0]) return notFound("Depósito no encontrado.");
    return { body: { data: rows[0] } };
  },
});

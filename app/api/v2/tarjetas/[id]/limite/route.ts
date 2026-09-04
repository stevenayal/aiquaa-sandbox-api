export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiV2Pool } from "@/lib/db";
import { apiRoute, notFound, conflict, badRequest } from "@/lib/api-route";

const schema = z.object({
  id: z.coerce.number().int().positive(),
  limiteCredito: z.number().nonnegative(),
});

// El nuevo límite no puede quedar por debajo de lo ya consumido — la tabla
// tiene el mismo CHECK, pero validarlo acá devuelve un 400 con mensaje
// entendible en vez del error crudo de Postgres.
export const PATCH = apiRoute({
  curso: 2,
  inputSchema: schema,
  handler: async ({ id, limiteCredito }) => {
    const pool = getQaApiV2Pool();
    const { rows } = await pool.query(
      "SELECT id, tipo, estado, saldo_utilizado FROM tarjetas WHERE id = $1 AND activo = true",
      [id],
    );
    const tarjeta = rows[0];
    if (!tarjeta) return notFound("Tarjeta no encontrada.");
    if (tarjeta.tipo !== "credito") {
      return conflict("Solo las tarjetas de crédito tienen límite.");
    }
    if (limiteCredito < Number(tarjeta.saldo_utilizado)) {
      return badRequest(
        `El límite no puede ser menor al saldo utilizado (${tarjeta.saldo_utilizado}).`,
      );
    }

    const { rows: updated } = await pool.query(
      `UPDATE tarjetas SET limite_credito = $1 WHERE id = $2
        RETURNING *, (limite_credito - saldo_utilizado) AS disponible`,
      [limiteCredito, id],
    );
    return { body: { data: updated[0] } };
  },
});

export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiV2Pool } from "@/lib/db";
import { apiRoute, notFound } from "@/lib/api-route";

const schema = z.object({
  id: z.coerce.number().int().positive(),
});

// Vista reducida del saldo — el caso de test más común del Grupo 1 no necesita
// la fila entera de la cuenta.
export const GET = apiRoute({
  curso: 2,
  inputSchema: schema,
  handler: async ({ id }) => {
    const { rows } = await getQaApiV2Pool().query(
      `SELECT c.id AS cuenta_id,
              c.numero_cuenta,
              c.moneda,
              c.saldo,
              c.estado,
              (SELECT max(created_at) FROM movimientos m
                WHERE m.cuenta_id = c.id AND m.activo = true) AS ultimo_movimiento
         FROM cuentas c
        WHERE c.id = $1 AND c.activa = true`,
      [id],
    );
    if (!rows[0]) return notFound("Cuenta no encontrada.");
    return { body: { data: rows[0] } };
  },
});

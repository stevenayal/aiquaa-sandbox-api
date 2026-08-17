export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiPool, withTransaction } from "@/lib/db";
import { apiRoute, notFound } from "@/lib/api-route";

const schema = z.object({
  id: z.coerce.number().int().positive(),
  metodoPago: z.enum(["tarjeta", "cuenta", "efectivo"]),
});

export const POST = apiRoute({
  inputSchema: schema,
  handler: async ({ id, metodoPago }) => {
    return withTransaction(getQaApiPool(), async (client) => {
      // FOR UPDATE evita que dos requests paguen la misma factura a la vez
      // dentro de la transacción.
      const { rows } = await client.query(
        "SELECT * FROM facturas WHERE id = $1 AND estado <> 'pagada' FOR UPDATE",
        [id],
      );
      const factura = rows[0];
      if (!factura) return notFound("Factura no encontrada o ya pagada.");

      const { rows: pagoRows } = await client.query(
        `INSERT INTO pagos (factura_id, usuario_id, monto, metodo_pago, estado)
         VALUES ($1, $2, $3, $4, 'procesado') RETURNING *`,
        [factura.id, factura.usuario_id, factura.monto, metodoPago],
      );
      const { rows: facturaRows } = await client.query(
        "UPDATE facturas SET estado = 'pagada' WHERE id = $1 RETURNING *",
        [id],
      );
      return { body: { data: { factura: facturaRows[0], pago: pagoRows[0] } } };
    });
  },
});

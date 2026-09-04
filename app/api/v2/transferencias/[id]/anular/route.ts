export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiV2Pool, withTransaction } from "@/lib/db";
import { apiRoute, notFound, conflict } from "@/lib/api-route";

const schema = z.object({
  id: z.coerce.number().int().positive(),
  motivo: z.string().optional(),
});

// Anular no borra la transferencia: la marca 'anulada' y escribe los
// movimientos inversos (contraasiento), como haría un banco real.
export const POST = apiRoute({
  curso: 2,
  inputSchema: schema,
  handler: async ({ id, motivo }) => {
    return withTransaction(getQaApiV2Pool(), async (client) => {
      const { rows } = await client.query(
        "SELECT * FROM transferencias WHERE id = $1 AND activo = true FOR UPDATE",
        [id],
      );
      const transferencia = rows[0];
      if (!transferencia) return notFound("Transferencia no encontrada.");
      if (transferencia.estado !== "completada") {
        return conflict(`Solo se puede anular una transferencia completada (está '${transferencia.estado}').`);
      }

      const descripcion = motivo ?? `Anulación de transferencia ${transferencia.referencia}`;

      // Si la transferencia fue interna, primero hay que recuperar el dinero
      // del destino: si ya lo gastó, la anulación no procede.
      if (transferencia.cuenta_destino_id != null) {
        const { rows: destinoRows } = await client.query(
          "SELECT * FROM cuentas WHERE id = $1 FOR UPDATE",
          [transferencia.cuenta_destino_id],
        );
        if (Number(destinoRows[0].saldo) < Number(transferencia.monto)) {
          return conflict("La cuenta destino no tiene saldo suficiente para revertir la transferencia.");
        }
        const { rows: destinoActualizado } = await client.query(
          "UPDATE cuentas SET saldo = saldo - $1 WHERE id = $2 RETURNING *",
          [transferencia.monto, transferencia.cuenta_destino_id],
        );
        await client.query(
          `INSERT INTO movimientos (cuenta_id, tipo, monto, saldo_posterior, referencia_tipo, referencia_id, descripcion)
           VALUES ($1, 'debito', $2, $3, 'transferencia', $4, $5)`,
          [
            transferencia.cuenta_destino_id,
            transferencia.monto,
            destinoActualizado[0].saldo,
            transferencia.id,
            descripcion,
          ],
        );
      }

      const { rows: origenRows } = await client.query(
        "UPDATE cuentas SET saldo = saldo + $1 WHERE id = $2 RETURNING *",
        [transferencia.monto, transferencia.cuenta_origen_id],
      );
      await client.query(
        `INSERT INTO movimientos (cuenta_id, tipo, monto, saldo_posterior, referencia_tipo, referencia_id, descripcion)
         VALUES ($1, 'credito', $2, $3, 'transferencia', $4, $5)`,
        [
          transferencia.cuenta_origen_id,
          transferencia.monto,
          origenRows[0].saldo,
          transferencia.id,
          descripcion,
        ],
      );

      const { rows: updated } = await client.query(
        "UPDATE transferencias SET estado = 'anulada' WHERE id = $1 RETURNING *",
        [id],
      );
      return { body: { data: { ...updated[0], cuenta_origen: origenRows[0] } } };
    });
  },
});

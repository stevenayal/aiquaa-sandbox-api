export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiV2Pool, withTransaction } from "@/lib/db";
import { apiRoute, notFound, conflict } from "@/lib/api-route";

const schema = z.object({
  id: z.coerce.number().int().positive(),
});

// Precancelación: se acredita el capital más el interés prorrateado por los
// días efectivamente transcurridos (interés simple), no el interés completo
// del plazo pactado. Todo el cálculo va en SQL/numeric para no arrastrar
// errores de punto flotante en pesos.
export const POST = apiRoute({
  curso: 2,
  inputSchema: schema,
  handler: async ({ id }) => {
    return withTransaction(getQaApiV2Pool(), async (client) => {
      const { rows } = await client.query(
        `SELECT *,
                greatest(current_date - fecha_inicio, 0) AS dias_transcurridos,
                round(
                  monto * tasa_anual / 100
                  * least(greatest(current_date - fecha_inicio, 0), plazo_dias) / 365.0,
                2) AS interes_prorrateado
           FROM depositos
          WHERE id = $1 AND activo = true
          FOR UPDATE`,
        [id],
      );
      const deposito = rows[0];
      if (!deposito) return notFound("Depósito no encontrado.");
      if (deposito.estado !== "activo") {
        return conflict(`El depósito ya está '${deposito.estado}'.`);
      }

      const { rows: cuentaRows } = await client.query(
        "SELECT * FROM cuentas WHERE id = $1 AND activa = true FOR UPDATE",
        [deposito.cuenta_id],
      );
      if (!cuentaRows[0]) return notFound("Cuenta asociada al depósito no encontrada.");

      const { rows: cuentaActualizada } = await client.query(
        "UPDATE cuentas SET saldo = saldo + $1 + $2 WHERE id = $3 RETURNING *",
        [deposito.monto, deposito.interes_prorrateado, deposito.cuenta_id],
      );
      const { rows: depositoActualizado } = await client.query(
        `UPDATE depositos SET estado = 'cancelado', interes_generado = $1
          WHERE id = $2 RETURNING *`,
        [deposito.interes_prorrateado, id],
      );
      await client.query(
        `INSERT INTO movimientos (cuenta_id, tipo, monto, saldo_posterior, referencia_tipo, referencia_id, descripcion)
         VALUES ($1, 'credito', $2, $3, 'deposito', $4, 'Cancelación anticipada de depósito')`,
        [
          deposito.cuenta_id,
          Number(deposito.monto) + Number(deposito.interes_prorrateado),
          cuentaActualizada[0].saldo,
          id,
        ],
      );

      return {
        body: {
          data: {
            ...depositoActualizado[0],
            dias_transcurridos: deposito.dias_transcurridos,
            cuenta: cuentaActualizada[0],
          },
        },
      };
    });
  },
});

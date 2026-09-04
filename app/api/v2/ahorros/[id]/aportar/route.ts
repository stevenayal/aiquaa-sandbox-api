export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiV2Pool, withTransaction } from "@/lib/db";
import { apiRoute, notFound, conflict } from "@/lib/api-route";

const schema = z.object({
  id: z.coerce.number().int().positive(),
  monto: z.number().positive().optional(),
});

// Aporte al plan: debita la cuenta asociada, suma al saldo acumulado y deja el
// plan 'completado' al alcanzar la meta. Sin `monto` en el body se usa el
// aporte_mensual del plan. Transaccional: cuenta y plan tienen que moverse
// juntos o no moverse.
export const POST = apiRoute({
  curso: 2,
  inputSchema: schema,
  handler: async ({ id, monto }) => {
    return withTransaction(getQaApiV2Pool(), async (client) => {
      const { rows } = await client.query(
        "SELECT * FROM ahorros WHERE id = $1 AND activo = true FOR UPDATE",
        [id],
      );
      const ahorro = rows[0];
      if (!ahorro) return notFound("Plan de ahorro no encontrado.");
      if (ahorro.estado !== "activo") {
        return conflict(`El plan está '${ahorro.estado}': no admite aportes.`);
      }

      const aporte = monto ?? Number(ahorro.aporte_mensual);

      const { rows: cuentaRows } = await client.query(
        "SELECT * FROM cuentas WHERE id = $1 AND activa = true FOR UPDATE",
        [ahorro.cuenta_id],
      );
      const cuenta = cuentaRows[0];
      if (!cuenta) return notFound("Cuenta asociada al plan no encontrada.");
      if (cuenta.estado !== "activa") {
        return conflict(`La cuenta asociada está ${cuenta.estado}: no admite débitos.`);
      }
      if (Number(cuenta.saldo) < aporte) {
        return conflict("Saldo insuficiente en la cuenta para el aporte.");
      }

      const { rows: cuentaActualizada } = await client.query(
        "UPDATE cuentas SET saldo = saldo - $1 WHERE id = $2 RETURNING *",
        [aporte, ahorro.cuenta_id],
      );
      const { rows: ahorroActualizado } = await client.query(
        `UPDATE ahorros
            SET saldo_acumulado = saldo_acumulado + $1,
                estado = CASE WHEN saldo_acumulado + $1 >= meta_monto THEN 'completado' ELSE estado END
          WHERE id = $2
          RETURNING *, (meta_monto - saldo_acumulado) AS falta_para_meta`,
        [aporte, id],
      );
      await client.query(
        `INSERT INTO movimientos (cuenta_id, tipo, monto, saldo_posterior, referencia_tipo, referencia_id, descripcion)
         VALUES ($1, 'debito', $2, $3, 'ahorro', $4, $5)`,
        [
          ahorro.cuenta_id,
          aporte,
          cuentaActualizada[0].saldo,
          id,
          `Aporte a meta ${ahorro.nombre_meta}`,
        ],
      );

      return {
        status: 201,
        body: { data: { ...ahorroActualizado[0], cuenta: cuentaActualizada[0] } },
      };
    });
  },
});

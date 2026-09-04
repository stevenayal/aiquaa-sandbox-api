export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiV2Pool, withTransaction } from "@/lib/db";
import { apiRoute, notFound, conflict } from "@/lib/api-route";

const schema = z.object({
  id: z.coerce.number().int().positive(),
  numero: z.coerce.number().int().positive(),
});

// Pagar una cuota: la marca 'pagada', descuenta su monto del saldo pendiente
// del préstamo y, si el saldo llega a 0, pasa el préstamo a 'pagado'.
// FOR UPDATE sobre la cuota evita que dos requests paguen la misma dos veces.
// greatest(..., 0) protege el CHECK saldo_pendiente >= 0 frente a diferencias
// de redondeo de la última cuota.
export const POST = apiRoute({
  curso: 2,
  inputSchema: schema,
  handler: async ({ id, numero }) => {
    return withTransaction(getQaApiV2Pool(), async (client) => {
      const { rows: prestamoRows } = await client.query(
        "SELECT * FROM prestamos WHERE id = $1 AND activo = true FOR UPDATE",
        [id],
      );
      const prestamo = prestamoRows[0];
      if (!prestamo) return notFound("Préstamo no encontrado.");
      if (prestamo.estado !== "aprobado") {
        return conflict(`El préstamo está en estado '${prestamo.estado}': no admite pagos.`);
      }

      const { rows: cuotaRows } = await client.query(
        "SELECT * FROM cuotas_prestamo WHERE prestamo_id = $1 AND numero_cuota = $2 FOR UPDATE",
        [id, numero],
      );
      const cuota = cuotaRows[0];
      if (!cuota) return notFound("Cuota no encontrada.");
      if (cuota.estado === "pagada") return conflict("La cuota ya fue pagada.");

      const { rows: cuotaActualizada } = await client.query(
        `UPDATE cuotas_prestamo SET estado = 'pagada', fecha_pago = now()
          WHERE id = $1 RETURNING *`,
        [cuota.id],
      );
      const { rows: prestamoActualizado } = await client.query(
        `UPDATE prestamos
            SET saldo_pendiente = greatest(saldo_pendiente - $1, 0),
                estado = CASE WHEN saldo_pendiente - $1 <= 0 THEN 'pagado' ELSE estado END
          WHERE id = $2
          RETURNING *`,
        [cuota.monto, id],
      );

      return {
        body: { data: { cuota: cuotaActualizada[0], prestamo: prestamoActualizado[0] } },
      };
    });
  },
});

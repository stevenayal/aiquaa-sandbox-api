export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiV2Pool, withTransaction } from "@/lib/db";
import { apiRoute, notFound, conflict } from "@/lib/api-route";

const schema = z.object({
  id: z.coerce.number().int().positive(),
});

// Aprobar = pasar a 'aprobado', fijar el saldo pendiente (capital + interés
// simple) y emitir el plan de cuotas. Todo en una transacción con
// SELECT ... FOR UPDATE: sin el lock, dos aprobaciones simultáneas generarían
// el plan dos veces (el UNIQUE (prestamo_id, numero_cuota) haría fallar la
// segunda a mitad de camino).
// La aritmética de la cuota se hace en SQL/numeric; el redondeo a 2 decimales
// puede dejar una diferencia de centavos contra el total, que se ajusta en la
// última cuota.
export const POST = apiRoute({
  curso: 2,
  inputSchema: schema,
  handler: async ({ id }) => {
    return withTransaction(getQaApiV2Pool(), async (client) => {
      const { rows } = await client.query(
        "SELECT * FROM prestamos WHERE id = $1 AND activo = true FOR UPDATE",
        [id],
      );
      const prestamo = rows[0];
      if (!prestamo) return notFound("Préstamo no encontrado.");
      if (prestamo.estado !== "solicitado") {
        return conflict(`El préstamo ya está en estado '${prestamo.estado}'.`);
      }

      const { rows: totalRows } = await client.query(
        `SELECT round($1::numeric * (1 + $2::numeric / 100), 2) AS total,
                round($1::numeric * (1 + $2::numeric / 100) / $3::int, 2) AS cuota`,
        [prestamo.monto_solicitado, prestamo.tasa_interes, prestamo.plazo_meses],
      );
      const total = Number(totalRows[0].total);
      const cuota = Number(totalRows[0].cuota);
      const plazo: number = prestamo.plazo_meses;

      const cuotas = [];
      for (let numero = 1; numero <= plazo; numero++) {
        // La última cuota absorbe el redondeo para que la suma cierre exacta.
        const monto = numero === plazo ? Number((total - cuota * (plazo - 1)).toFixed(2)) : cuota;
        const { rows: cuotaRows } = await client.query(
          `INSERT INTO cuotas_prestamo (prestamo_id, numero_cuota, monto, fecha_vencimiento)
           VALUES ($1, $2, $3, (current_date + make_interval(months => $2::int))::date)
           RETURNING *`,
          [id, numero, monto],
        );
        cuotas.push(cuotaRows[0]);
      }

      const { rows: updated } = await client.query(
        `UPDATE prestamos SET estado = 'aprobado', saldo_pendiente = $1
          WHERE id = $2 RETURNING *`,
        [total, id],
      );
      return { body: { data: { ...updated[0], cuotas } } };
    });
  },
});

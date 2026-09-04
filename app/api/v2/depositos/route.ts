export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiV2Pool, withTransaction } from "@/lib/db";
import { apiRoute, notFound, conflict } from "@/lib/api-route";

const getSchema = z.object({
  usuarioId: z.coerce.number().int().positive().optional(),
  estado: z.enum(["activo", "vencido", "cancelado"]).optional(),
});

const postSchema = z.object({
  usuarioId: z.coerce.number().int().positive(),
  cuentaId: z.coerce.number().int().positive(),
  monto: z.number().positive(),
  tasaAnual: z.number().nonnegative().max(999.99),
  plazoDias: z.number().int().min(30).max(1095),
});

// interes_proyectado = monto * tasa/100 * plazo/365 (interés simple), calculado
// en el SELECT: es lo que el depósito va a rendir si llega a vencimiento.
const SELECT_DEPOSITO = `SELECT *,
       round(monto * tasa_anual / 100 * plazo_dias / 365.0, 2) AS interes_proyectado,
       (fecha_vencimiento - current_date) AS dias_restantes
  FROM depositos`;

export const GET = apiRoute({
  curso: 2,
  inputSchema: getSchema,
  handler: async ({ usuarioId, estado }) => {
    const { rows } = await getQaApiV2Pool().query(
      `${SELECT_DEPOSITO}
        WHERE activo = true
          AND ($1::bigint IS NULL OR usuario_id = $1)
          AND ($2::text IS NULL OR estado = $2)
        ORDER BY id
        LIMIT 100`,
      [usuarioId ?? null, estado ?? null],
    );
    return { body: { data: rows } };
  },
});

// Constituir un plazo fijo debita la cuenta: el dinero queda inmovilizado
// hasta el vencimiento (o hasta POST /depositos/{id}/cancelar).
export const POST = apiRoute({
  curso: 2,
  inputSchema: postSchema,
  handler: async ({ usuarioId, cuentaId, monto, tasaAnual, plazoDias }) => {
    return withTransaction(getQaApiV2Pool(), async (client) => {
      const { rows: cuentaRows } = await client.query(
        "SELECT * FROM cuentas WHERE id = $1 AND activa = true FOR UPDATE",
        [cuentaId],
      );
      const cuenta = cuentaRows[0];
      if (!cuenta) return notFound("Cuenta no encontrada.");
      if (cuenta.estado !== "activa") {
        return conflict(`La cuenta está ${cuenta.estado}: no admite débitos.`);
      }
      if (Number(cuenta.saldo) < monto) {
        return conflict("Saldo insuficiente para constituir el depósito.");
      }

      const { rows: cuentaActualizada } = await client.query(
        "UPDATE cuentas SET saldo = saldo - $1 WHERE id = $2 RETURNING *",
        [monto, cuentaId],
      );
      const { rows: depositoRows } = await client.query(
        `INSERT INTO depositos
           (usuario_id, cuenta_id, monto, tasa_anual, plazo_dias, fecha_inicio, fecha_vencimiento)
         VALUES ($1, $2, $3, $4, $5, current_date, current_date + $5::int)
         RETURNING *,
           round(monto * tasa_anual / 100 * plazo_dias / 365.0, 2) AS interes_proyectado,
           (fecha_vencimiento - current_date) AS dias_restantes`,
        [usuarioId, cuentaId, monto, tasaAnual, plazoDias],
      );
      await client.query(
        `INSERT INTO movimientos (cuenta_id, tipo, monto, saldo_posterior, referencia_tipo, referencia_id, descripcion)
         VALUES ($1, 'debito', $2, $3, 'deposito', $4, 'Constitución de depósito a plazo')`,
        [cuentaId, monto, cuentaActualizada[0].saldo, depositoRows[0].id],
      );

      return {
        status: 201,
        body: { data: { ...depositoRows[0], cuenta: cuentaActualizada[0] } },
      };
    });
  },
});

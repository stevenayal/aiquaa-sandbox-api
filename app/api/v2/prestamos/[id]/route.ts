export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiV2Pool } from "@/lib/db";
import { apiRoute, notFound, noContent, conflict } from "@/lib/api-route";

const idSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const putSchema = z.object({
  id: z.coerce.number().int().positive(),
  montoSolicitado: z.number().positive(),
  tasaInteres: z.number().nonnegative().max(999.99),
  plazoMeses: z.number().int().min(1).max(120),
});

export const GET = apiRoute({
  curso: 2,
  inputSchema: idSchema,
  handler: async ({ id }) => {
    const { rows } = await getQaApiV2Pool().query(
      "SELECT * FROM prestamos WHERE id = $1 AND activo = true",
      [id],
    );
    if (!rows[0]) return notFound("Préstamo no encontrado.");
    return { body: { data: rows[0] } };
  },
});

// Las condiciones solo se pueden reescribir mientras el préstamo sigue
// 'solicitado': una vez aprobado ya existe un plan de cuotas emitido contra
// esos números.
export const PUT = apiRoute({
  curso: 2,
  inputSchema: putSchema,
  handler: async ({ id, montoSolicitado, tasaInteres, plazoMeses }) => {
    const pool = getQaApiV2Pool();
    const { rows } = await pool.query(
      "SELECT id, estado FROM prestamos WHERE id = $1 AND activo = true",
      [id],
    );
    const prestamo = rows[0];
    if (!prestamo) return notFound("Préstamo no encontrado.");
    if (prestamo.estado !== "solicitado") {
      return conflict(`Un préstamo en estado '${prestamo.estado}' ya no puede modificarse.`);
    }

    const { rows: updated } = await pool.query(
      `UPDATE prestamos SET monto_solicitado = $1, tasa_interes = $2, plazo_meses = $3
        WHERE id = $4 RETURNING *`,
      [montoSolicitado, tasaInteres, plazoMeses, id],
    );
    return { body: { data: updated[0] } };
  },
});

// Soft-delete solo si no quedó plata en la calle.
export const DELETE = apiRoute({
  curso: 2,
  inputSchema: idSchema,
  handler: async ({ id }) => {
    const pool = getQaApiV2Pool();
    const { rows } = await pool.query(
      "SELECT id, saldo_pendiente FROM prestamos WHERE id = $1 AND activo = true",
      [id],
    );
    if (!rows[0]) return notFound("Préstamo no encontrado.");
    if (Number(rows[0].saldo_pendiente) > 0) {
      return conflict("No se puede eliminar un préstamo con saldo pendiente.");
    }
    await pool.query("UPDATE prestamos SET activo = false WHERE id = $1", [id]);
    return noContent();
  },
});

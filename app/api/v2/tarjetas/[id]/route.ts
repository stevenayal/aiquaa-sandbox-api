export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiV2Pool } from "@/lib/db";
import { apiRoute, notFound, noContent, conflict } from "@/lib/api-route";

const idSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// El límite se mueve por PATCH /limite y el estado por /bloquear|/activar:
// el PUT solo reemplaza los datos "de plástico" de la tarjeta.
const putSchema = z.object({
  id: z.coerce.number().int().positive(),
  marca: z.enum(["visa", "mastercard", "amex"]),
  fechaVencimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato esperado: YYYY-MM-DD"),
});

export const GET = apiRoute({
  curso: 2,
  inputSchema: idSchema,
  handler: async ({ id }) => {
    const { rows } = await getQaApiV2Pool().query(
      `SELECT *, (limite_credito - saldo_utilizado) AS disponible
         FROM tarjetas WHERE id = $1 AND activo = true`,
      [id],
    );
    if (!rows[0]) return notFound("Tarjeta no encontrada.");
    return { body: { data: rows[0] } };
  },
});

export const PUT = apiRoute({
  curso: 2,
  inputSchema: putSchema,
  handler: async ({ id, marca, fechaVencimiento }) => {
    const { rows } = await getQaApiV2Pool().query(
      `UPDATE tarjetas SET marca = $1, fecha_vencimiento = $2
        WHERE id = $3 AND activo = true
        RETURNING *, (limite_credito - saldo_utilizado) AS disponible`,
      [marca, fechaVencimiento, id],
    );
    if (!rows[0]) return notFound("Tarjeta no encontrada.");
    return { body: { data: rows[0] } };
  },
});

// Una tarjeta con saldo utilizado no se da de baja: primero hay que cancelar
// el consumo pendiente.
export const DELETE = apiRoute({
  curso: 2,
  inputSchema: idSchema,
  handler: async ({ id }) => {
    const pool = getQaApiV2Pool();
    const { rows } = await pool.query(
      "SELECT id, saldo_utilizado FROM tarjetas WHERE id = $1 AND activo = true",
      [id],
    );
    if (!rows[0]) return notFound("Tarjeta no encontrada.");
    if (Number(rows[0].saldo_utilizado) > 0) {
      return conflict("No se puede eliminar una tarjeta con saldo utilizado pendiente.");
    }
    await pool.query("UPDATE tarjetas SET activo = false WHERE id = $1", [id]);
    return noContent();
  },
});

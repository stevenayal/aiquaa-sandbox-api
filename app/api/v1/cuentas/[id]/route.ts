export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiPool } from "@/lib/db";
import { apiRoute, notFound, noContent } from "@/lib/api-route";

const getSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// numeroCuenta y saldo quedan fuera del PUT (identidad/estado financiero
// inmutables vía replace); activa sigue gobernado únicamente por DELETE.
const putSchema = z.object({
  id: z.coerce.number().int().positive(),
  tipoCuenta: z.enum(["ahorro", "corriente"]),
  moneda: z.enum(["PYG", "USD"]),
});

export const GET = apiRoute({
  curso: 1,
  inputSchema: getSchema,
  handler: async ({ id }) => {
    const pool = getQaApiPool();
    const { rows } = await pool.query(
      "SELECT * FROM cuentas WHERE id = $1 AND activa = true",
      [id],
    );
    if (!rows[0]) return notFound("Cuenta no encontrada.");
    return { body: { data: rows[0] } };
  },
});

export const PUT = apiRoute({
  curso: 1,
  inputSchema: putSchema,
  handler: async ({ id, tipoCuenta, moneda }) => {
    const pool = getQaApiPool();
    const { rows } = await pool.query(
      `UPDATE cuentas SET tipo_cuenta = $1, moneda = $2
       WHERE id = $3 AND activa = true
       RETURNING *`,
      [tipoCuenta, moneda, id],
    );
    if (!rows[0]) return notFound("Cuenta no encontrada.");
    return { body: { data: rows[0] } };
  },
});

export const DELETE = apiRoute({
  curso: 1,
  inputSchema: getSchema,
  handler: async ({ id }) => {
    const pool = getQaApiPool();
    const { rows } = await pool.query(
      "UPDATE cuentas SET activa = false WHERE id = $1 AND activa = true RETURNING id",
      [id],
    );
    if (!rows[0]) return notFound("Cuenta no encontrada.");
    return noContent();
  },
});

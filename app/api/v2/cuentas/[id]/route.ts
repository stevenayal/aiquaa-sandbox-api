export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiV2Pool } from "@/lib/db";
import { apiRoute, notFound, noContent, conflict } from "@/lib/api-route";

const idSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// numeroCuenta, saldo y estado quedan fuera del PUT: identidad, dinero y
// estado de negocio se mueven por sus propios endpoints (/movimientos,
// /estado), nunca por un replace del recurso.
const putSchema = z.object({
  id: z.coerce.number().int().positive(),
  tipoCuenta: z.enum(["ahorro", "corriente"]),
  moneda: z.enum(["PYG", "USD"]),
});

export const GET = apiRoute({
  curso: 2,
  inputSchema: idSchema,
  handler: async ({ id }) => {
    const { rows } = await getQaApiV2Pool().query(
      "SELECT * FROM cuentas WHERE id = $1 AND activa = true",
      [id],
    );
    if (!rows[0]) return notFound("Cuenta no encontrada.");
    return { body: { data: rows[0] } };
  },
});

export const PUT = apiRoute({
  curso: 2,
  inputSchema: putSchema,
  handler: async ({ id, tipoCuenta, moneda }) => {
    const { rows } = await getQaApiV2Pool().query(
      `UPDATE cuentas SET tipo_cuenta = $1, moneda = $2
       WHERE id = $3 AND activa = true
       RETURNING *`,
      [tipoCuenta, moneda, id],
    );
    if (!rows[0]) return notFound("Cuenta no encontrada.");
    return { body: { data: rows[0] } };
  },
});

// No se da de baja una cuenta con saldo: primero hay que vaciarla (retiro o
// transferencia), igual que en un banco real.
export const DELETE = apiRoute({
  curso: 2,
  inputSchema: idSchema,
  handler: async ({ id }) => {
    const pool = getQaApiV2Pool();
    const { rows } = await pool.query(
      "SELECT id, saldo FROM cuentas WHERE id = $1 AND activa = true",
      [id],
    );
    if (!rows[0]) return notFound("Cuenta no encontrada.");
    if (Number(rows[0].saldo) > 0) {
      return conflict("No se puede eliminar una cuenta con saldo distinto de 0.");
    }
    await pool.query("UPDATE cuentas SET activa = false WHERE id = $1", [id]);
    return noContent();
  },
});

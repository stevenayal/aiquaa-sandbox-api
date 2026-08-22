export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiPool } from "@/lib/db";
import { apiRoute } from "@/lib/api-route";

const getSchema = z.object({
  usuarioId: z.coerce.number().int().positive().optional(),
});

const postSchema = z.object({
  usuarioId: z.coerce.number().int().positive(),
  tipoCuenta: z.enum(["ahorro", "corriente"]),
  moneda: z.enum(["PYG", "USD"]),
});

export const GET = apiRoute({
  inputSchema: getSchema,
  handler: async ({ usuarioId }) => {
    const pool = getQaApiPool();
    const { rows } = usuarioId
      ? await pool.query(
          "SELECT * FROM cuentas WHERE usuario_id = $1 AND activa = true ORDER BY id",
          [usuarioId],
        )
      : await pool.query("SELECT * FROM cuentas WHERE activa = true ORDER BY id LIMIT 100");
    return { body: { data: rows } };
  },
});

// numero_cuenta es puramente decorativo (no hay datos reales) — se genera un
// número al azar, igual que numero_enmascarado en tarjetas. saldo queda en 0
// (default de la tabla): nada en este sandbox lo mueve todavía.
export const POST = apiRoute({
  inputSchema: postSchema,
  handler: async ({ usuarioId, tipoCuenta, moneda }) => {
    const pool = getQaApiPool();
    const numeroCuenta = String(Math.floor(1_000_000_000 + Math.random() * 9_000_000_000));
    const { rows } = await pool.query(
      `INSERT INTO cuentas (usuario_id, numero_cuenta, tipo_cuenta, moneda)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [usuarioId, numeroCuenta, tipoCuenta, moneda],
    );
    return { status: 201, body: { data: rows[0] } };
  },
});

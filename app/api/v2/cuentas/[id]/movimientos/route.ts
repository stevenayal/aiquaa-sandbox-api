export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiV2Pool, withTransaction } from "@/lib/db";
import { apiRoute, notFound, conflict } from "@/lib/api-route";

const getSchema = z.object({
  id: z.coerce.number().int().positive(),
  tipo: z.enum(["debito", "credito"]).optional(),
});

const postSchema = z.object({
  id: z.coerce.number().int().positive(),
  tipo: z.enum(["debito", "credito"]),
  monto: z.number().positive(),
  descripcion: z.string().optional(),
});

export const GET = apiRoute({
  curso: 2,
  inputSchema: getSchema,
  handler: async ({ id, tipo }) => {
    const pool = getQaApiV2Pool();
    const { rows: cuentaRows } = await pool.query(
      "SELECT id FROM cuentas WHERE id = $1 AND activa = true",
      [id],
    );
    if (!cuentaRows[0]) return notFound("Cuenta no encontrada.");

    const { rows } = await pool.query(
      `SELECT * FROM movimientos
        WHERE cuenta_id = $1 AND activo = true AND ($2::text IS NULL OR tipo = $2)
        ORDER BY id
        LIMIT 100`,
      [id, tipo ?? null],
    );
    return { body: { data: rows } };
  },
});

// Depósito (credito) o retiro (debito). Transaccional con SELECT ... FOR
// UPDATE sobre la cuenta: sin el lock, dos retiros simultáneos podrían leer el
// mismo saldo y dejarlo en negativo. La aritmética va en SQL (numeric), nunca
// en JS, para no perder centavos por punto flotante.
export const POST = apiRoute({
  curso: 2,
  inputSchema: postSchema,
  handler: async ({ id, tipo, monto, descripcion }) => {
    return withTransaction(getQaApiV2Pool(), async (client) => {
      const { rows } = await client.query(
        "SELECT * FROM cuentas WHERE id = $1 AND activa = true FOR UPDATE",
        [id],
      );
      const cuenta = rows[0];
      if (!cuenta) return notFound("Cuenta no encontrada.");
      if (cuenta.estado !== "activa") {
        return conflict(`La cuenta está ${cuenta.estado}: no admite movimientos.`);
      }
      if (tipo === "debito" && Number(cuenta.saldo) < monto) {
        return conflict("Saldo insuficiente para el débito solicitado.");
      }

      const { rows: cuentaRows } = await client.query(
        `UPDATE cuentas
            SET saldo = saldo + ($1 * CASE WHEN $2 = 'credito' THEN 1 ELSE -1 END)
          WHERE id = $3
          RETURNING *`,
        [monto, tipo, id],
      );
      const { rows: movRows } = await client.query(
        `INSERT INTO movimientos (cuenta_id, tipo, monto, saldo_posterior, referencia_tipo, descripcion)
         VALUES ($1, $2, $3, $4, 'manual', $5)
         RETURNING *`,
        [id, tipo, monto, cuentaRows[0].saldo, descripcion ?? null],
      );

      return { status: 201, body: { data: { ...movRows[0], cuenta: cuentaRows[0] } } };
    });
  },
});

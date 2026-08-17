export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiPool } from "@/lib/db";
import { apiRoute } from "@/lib/api-route";

const schema = z.object({
  cuentaOrigenId: z.coerce.number().int().positive(),
  cuentaDestinoId: z.coerce.number().int().positive(),
  monto: z.coerce.number().positive(),
  descripcion: z.string().optional(),
});

// No muta cuentas.saldo en esta iteración: el schema no tiene una regla de
// fondos insuficientes, inventarla acá sería scope creep. Solo registra la
// transferencia como 'pendiente' — el saldo real queda para un endpoint
// futuro (ej. PATCH /transferencias/:id/completar) si hace falta.
export const POST = apiRoute({
  inputSchema: schema,
  handler: async ({ cuentaOrigenId, cuentaDestinoId, monto, descripcion }) => {
    const pool = getQaApiPool();
    const { rows } = await pool.query(
      `INSERT INTO transferencias (cuenta_origen_id, cuenta_destino_id, monto, descripcion, estado)
       VALUES ($1, $2, $3, $4, 'pendiente') RETURNING *`,
      [cuentaOrigenId, cuentaDestinoId, monto, descripcion ?? null],
    );
    return { status: 201, body: { data: rows[0] } };
  },
});

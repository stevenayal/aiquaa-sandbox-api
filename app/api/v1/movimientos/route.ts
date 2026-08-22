export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiPool } from "@/lib/db";
import { apiRoute } from "@/lib/api-route";

const getSchema = z.object({
  usuarioId: z.coerce.number().int().positive().optional(),
});

const postSchema = z.object({
  usuarioId: z.coerce.number().int().positive(),
  tipoMovimiento: z.enum(["transferencia", "pago_factura", "compra_ecommerce", "cargo_tarjeta"]),
  monto: z.coerce.number().positive(),
  referenciaId: z.coerce.number().int().positive().optional(),
  descripcion: z.string().optional(),
});

// Recurso de CRUD genérico para el grupo 9 — GET /reportes/movimientos y
// GET /reportes/resumen siguen siendo los agregados de solo lectura;
// movimientos es el ejemplo didáctico de GET/POST/PUT/DELETE completo sobre
// la tabla que esos reportes consultan.
export const GET = apiRoute({
  inputSchema: getSchema,
  handler: async ({ usuarioId }) => {
    const pool = getQaApiPool();
    const { rows } = usuarioId
      ? await pool.query(
          "SELECT * FROM movimientos WHERE usuario_id = $1 AND activo = true ORDER BY id",
          [usuarioId],
        )
      : await pool.query("SELECT * FROM movimientos WHERE activo = true ORDER BY id LIMIT 100");
    return { body: { data: rows } };
  },
});

export const POST = apiRoute({
  inputSchema: postSchema,
  handler: async ({ usuarioId, tipoMovimiento, monto, referenciaId, descripcion }) => {
    const pool = getQaApiPool();
    const { rows } = await pool.query(
      `INSERT INTO movimientos (usuario_id, tipo_movimiento, monto, referencia_id, descripcion)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [usuarioId, tipoMovimiento, monto, referenciaId ?? null, descripcion ?? null],
    );
    return { status: 201, body: { data: rows[0] } };
  },
});

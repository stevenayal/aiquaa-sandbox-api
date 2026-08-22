export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiPool } from "@/lib/db";
import { apiRoute } from "@/lib/api-route";

const getSchema = z.object({
  usuarioId: z.coerce.number().int().positive().optional(),
  estado: z.enum(["pendiente", "pagada", "vencida"]).optional(),
});

const postSchema = z.object({
  usuarioId: z.coerce.number().int().positive(),
  proveedor: z.enum(["ANDE", "ESSAP", "COPACO", "Tigo", "Personal"]),
  numeroFactura: z.string().min(1),
  monto: z.coerce.number().positive(),
  fechaVencimiento: z.string().min(1),
});

export const GET = apiRoute({
  inputSchema: getSchema,
  handler: async ({ usuarioId, estado }) => {
    const pool = getQaApiPool();
    const conditions: string[] = ["activo = true"];
    const params: unknown[] = [];
    if (usuarioId !== undefined) {
      params.push(usuarioId);
      conditions.push(`usuario_id = $${params.length}`);
    }
    if (estado !== undefined) {
      params.push(estado);
      conditions.push(`estado = $${params.length}`);
    }
    const where = `WHERE ${conditions.join(" AND ")}`;
    const { rows } = await pool.query(
      `SELECT * FROM facturas ${where} ORDER BY id LIMIT 100`,
      params,
    );
    return { body: { data: rows } };
  },
});

// estado queda en 'pendiente' (default de la tabla) — pasar a 'pagada' sigue
// siendo responsabilidad exclusiva de POST /facturas/{id}/pagar.
export const POST = apiRoute({
  inputSchema: postSchema,
  handler: async ({ usuarioId, proveedor, numeroFactura, monto, fechaVencimiento }) => {
    const pool = getQaApiPool();
    const { rows } = await pool.query(
      `INSERT INTO facturas (usuario_id, proveedor, numero_factura, monto, fecha_vencimiento)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [usuarioId, proveedor, numeroFactura, monto, fechaVencimiento],
    );
    return { status: 201, body: { data: rows[0] } };
  },
});

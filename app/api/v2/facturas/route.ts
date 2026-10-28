export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiV2Pool } from "@/lib/db";
import { apiRoute } from "@/lib/api-route";

const getSchema = z.object({
  usuarioId: z.coerce.number().int().positive().optional(),
  estado: z.enum(["pendiente", "pagada", "vencida"]).optional(),
});

const postSchema = z.object({
  usuarioId: z.coerce.number().int().positive(),
  proveedor: z.enum(["ANDE", "ESSAP", "COPACO", "Tigo", "Personal"]),
  numeroFactura: z.string().min(1),
  monto: z.number().positive(),
  fechaVencimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fechaVencimiento debe ser YYYY-MM-DD"),
});

export const GET = apiRoute({
  curso: 2,
  inputSchema: getSchema,
  handler: async ({ usuarioId, estado }) => {
    const { rows } = await getQaApiV2Pool().query(
      `SELECT * FROM facturas
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

// La factura nace 'pendiente' (default de la tabla): pasar a 'pagada' es
// responsabilidad exclusiva de POST /facturas/{id}/pagar, que mueve el saldo.
export const POST = apiRoute({
  curso: 2,
  inputSchema: postSchema,
  handler: async ({ usuarioId, proveedor, numeroFactura, monto, fechaVencimiento }) => {
    const { rows } = await getQaApiV2Pool().query(
      `INSERT INTO facturas (usuario_id, proveedor, numero_factura, monto, fecha_vencimiento)
       VALUES ($1, $2, $3, $4, $5::date) RETURNING *`,
      [usuarioId, proveedor, numeroFactura, monto, fechaVencimiento],
    );
    return { status: 201, body: { data: rows[0] } };
  },
});

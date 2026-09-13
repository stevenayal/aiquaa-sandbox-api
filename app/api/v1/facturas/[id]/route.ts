export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiPool } from "@/lib/db";
import { apiRoute, notFound, noContent } from "@/lib/api-route";

const getSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// estado queda fuera del PUT — sigue gobernado exclusivamente por
// POST /facturas/{id}/pagar, para no crear dos caminos que marquen 'pagada'.
const putSchema = z.object({
  id: z.coerce.number().int().positive(),
  proveedor: z.enum(["ANDE", "ESSAP", "COPACO", "Tigo", "Personal"]),
  numeroFactura: z.string().min(1),
  monto: z.coerce.number().positive(),
  fechaVencimiento: z.string().min(1),
});

export const GET = apiRoute({
  curso: 1,
  inputSchema: getSchema,
  handler: async ({ id }) => {
    const pool = getQaApiPool();
    const { rows } = await pool.query(
      "SELECT * FROM facturas WHERE id = $1 AND activo = true",
      [id],
    );
    if (!rows[0]) return notFound("Factura no encontrada.");
    return { body: { data: rows[0] } };
  },
});

export const PUT = apiRoute({
  curso: 1,
  inputSchema: putSchema,
  handler: async ({ id, proveedor, numeroFactura, monto, fechaVencimiento }) => {
    const pool = getQaApiPool();
    const { rows } = await pool.query(
      `UPDATE facturas
       SET proveedor = $1, numero_factura = $2, monto = $3, fecha_vencimiento = $4
       WHERE id = $5 AND activo = true
       RETURNING *`,
      [proveedor, numeroFactura, monto, fechaVencimiento, id],
    );
    if (!rows[0]) return notFound("Factura no encontrada.");
    return { body: { data: rows[0] } };
  },
});

export const DELETE = apiRoute({
  curso: 1,
  inputSchema: getSchema,
  handler: async ({ id }) => {
    const pool = getQaApiPool();
    const { rows } = await pool.query(
      "UPDATE facturas SET activo = false WHERE id = $1 AND activo = true RETURNING id",
      [id],
    );
    if (!rows[0]) return notFound("Factura no encontrada.");
    return noContent();
  },
});

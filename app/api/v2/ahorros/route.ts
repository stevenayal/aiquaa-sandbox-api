export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiV2Pool } from "@/lib/db";
import { apiRoute } from "@/lib/api-route";

const getSchema = z.object({
  usuarioId: z.coerce.number().int().positive().optional(),
  estado: z.enum(["activo", "completado", "cancelado"]).optional(),
});

const postSchema = z.object({
  usuarioId: z.coerce.number().int().positive(),
  cuentaId: z.coerce.number().int().positive(),
  nombreMeta: z.string().min(1),
  metaMonto: z.number().positive(),
  aporteMensual: z.number().positive(),
  tasaAnual: z.number().nonnegative().max(999.99).optional(),
});

export const GET = apiRoute({
  curso: 2,
  inputSchema: getSchema,
  handler: async ({ usuarioId, estado }) => {
    const { rows } = await getQaApiV2Pool().query(
      `SELECT *, (meta_monto - saldo_acumulado) AS falta_para_meta
         FROM ahorros
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

// El plan arranca en 0: el saldo acumulado solo crece vía POST /ahorros/{id}/aportar,
// que debita la cuenta asociada.
export const POST = apiRoute({
  curso: 2,
  inputSchema: postSchema,
  handler: async ({ usuarioId, cuentaId, nombreMeta, metaMonto, aporteMensual, tasaAnual }) => {
    const { rows } = await getQaApiV2Pool().query(
      `INSERT INTO ahorros (usuario_id, cuenta_id, nombre_meta, meta_monto, aporte_mensual, tasa_anual)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *, (meta_monto - saldo_acumulado) AS falta_para_meta`,
      [usuarioId, cuentaId, nombreMeta, metaMonto, aporteMensual, tasaAnual ?? 0],
    );
    return { status: 201, body: { data: rows[0] } };
  },
});

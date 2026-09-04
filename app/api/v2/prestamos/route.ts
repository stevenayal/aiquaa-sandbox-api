export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiV2Pool } from "@/lib/db";
import { apiRoute } from "@/lib/api-route";

const getSchema = z.object({
  usuarioId: z.coerce.number().int().positive().optional(),
  estado: z.enum(["solicitado", "aprobado", "rechazado", "pagado"]).optional(),
});

const postSchema = z.object({
  usuarioId: z.coerce.number().int().positive(),
  cuentaId: z.coerce.number().int().positive().optional(),
  montoSolicitado: z.number().positive(),
  tasaInteres: z.number().nonnegative().max(999.99),
  plazoMeses: z.number().int().min(1).max(120),
});

export const GET = apiRoute({
  curso: 2,
  inputSchema: getSchema,
  handler: async ({ usuarioId, estado }) => {
    const { rows } = await getQaApiV2Pool().query(
      `SELECT * FROM prestamos
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

// Un préstamo nace 'solicitado', con saldo_pendiente 0 y sin cuotas: el plan
// de cuotas lo genera POST /prestamos/{id}/aprobar.
export const POST = apiRoute({
  curso: 2,
  inputSchema: postSchema,
  handler: async ({ usuarioId, cuentaId, montoSolicitado, tasaInteres, plazoMeses }) => {
    const { rows } = await getQaApiV2Pool().query(
      `INSERT INTO prestamos (usuario_id, cuenta_id, monto_solicitado, tasa_interes, plazo_meses)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [usuarioId, cuentaId ?? null, montoSolicitado, tasaInteres, plazoMeses],
    );
    return { status: 201, body: { data: rows[0] } };
  },
});

export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiV2Pool } from "@/lib/db";
import { apiRoute } from "@/lib/api-route";

const getSchema = z.object({
  usuarioId: z.coerce.number().int().positive().optional(),
  estado: z.enum(["activa", "bloqueada", "vencida"]).optional(),
});

const postSchema = z.object({
  usuarioId: z.coerce.number().int().positive(),
  cuentaId: z.coerce.number().int().positive().optional(),
  tipo: z.enum(["credito", "debito"]),
  marca: z.enum(["visa", "mastercard", "amex"]),
  limiteCredito: z.number().nonnegative().optional(),
  fechaVencimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato esperado: YYYY-MM-DD"),
});

// `disponible` no es una columna: se deriva de limite_credito - saldo_utilizado
// en cada SELECT, así no puede quedar desincronizado tras un UPDATE parcial.
// (no se exporta: un route file de Next solo debe exportar handlers y config)
const SELECT_TARJETA = `SELECT *, (limite_credito - saldo_utilizado) AS disponible
    FROM tarjetas`;

export const GET = apiRoute({
  curso: 2,
  inputSchema: getSchema,
  handler: async ({ usuarioId, estado }) => {
    const { rows } = await getQaApiV2Pool().query(
      `${SELECT_TARJETA}
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

// numero_enmascarado es decorativo: se generan 4 dígitos al azar, no hay datos
// de tarjeta reales en el sandbox. Una tarjeta de débito nace con límite 0.
export const POST = apiRoute({
  curso: 2,
  inputSchema: postSchema,
  handler: async ({ usuarioId, cuentaId, tipo, marca, limiteCredito, fechaVencimiento }) => {
    const ultimos = String(Math.floor(1000 + Math.random() * 9000));
    const limite = tipo === "credito" ? (limiteCredito ?? 0) : 0;
    const { rows } = await getQaApiV2Pool().query(
      `INSERT INTO tarjetas
         (usuario_id, cuenta_id, tipo, marca, numero_enmascarado, limite_credito, fecha_vencimiento)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *, (limite_credito - saldo_utilizado) AS disponible`,
      [usuarioId, cuentaId ?? null, tipo, marca, `**** **** **** ${ultimos}`, limite, fechaVencimiento],
    );
    return { status: 201, body: { data: rows[0] } };
  },
});

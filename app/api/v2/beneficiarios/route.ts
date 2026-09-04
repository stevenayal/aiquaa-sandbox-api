export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiV2Pool } from "@/lib/db";
import { apiRoute } from "@/lib/api-route";

const getSchema = z.object({
  usuarioId: z.coerce.number().int().positive().optional(),
});

const postSchema = z.object({
  usuarioId: z.coerce.number().int().positive(),
  nombre: z.string().min(1),
  banco: z.string().min(1),
  numeroCuenta: z.string().min(1),
  alias: z.string().optional(),
});

export const GET = apiRoute({
  curso: 2,
  inputSchema: getSchema,
  handler: async ({ usuarioId }) => {
    const { rows } = await getQaApiV2Pool().query(
      `SELECT * FROM beneficiarios
        WHERE activo = true AND ($1::bigint IS NULL OR usuario_id = $1)
        ORDER BY id
        LIMIT 100`,
      [usuarioId ?? null],
    );
    return { body: { data: rows } };
  },
});

// UNIQUE (usuario_id, numero_cuenta): cargar dos veces el mismo beneficiario
// devuelve 409 (lo mapea apiRoute desde el SQLSTATE 23505).
export const POST = apiRoute({
  curso: 2,
  inputSchema: postSchema,
  handler: async ({ usuarioId, nombre, banco, numeroCuenta, alias }) => {
    const { rows } = await getQaApiV2Pool().query(
      `INSERT INTO beneficiarios (usuario_id, nombre, banco, numero_cuenta, alias)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [usuarioId, nombre, banco, numeroCuenta, alias ?? null],
    );
    return { status: 201, body: { data: rows[0] } };
  },
});

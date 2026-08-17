export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiPool } from "@/lib/db";
import { apiRoute } from "@/lib/api-route";

const getSchema = z.object({
  usuarioId: z.coerce.number().int().positive().optional(),
});

const postSchema = z.object({
  usuarioId: z.coerce.number().int().positive(),
  tipo: z.enum(["credito", "debito"]),
  marca: z.enum(["visa", "mastercard"]),
});

export const GET = apiRoute({
  inputSchema: getSchema,
  handler: async ({ usuarioId }) => {
    const pool = getQaApiPool();
    const { rows } = usuarioId
      ? await pool.query("SELECT * FROM tarjetas WHERE usuario_id = $1 ORDER BY id", [usuarioId])
      : await pool.query("SELECT * FROM tarjetas ORDER BY id LIMIT 100");
    return { body: { data: rows } };
  },
});

// numero_enmascarado es puramente decorativo (no hay datos reales de
// tarjeta en este sandbox) — se genera un sufijo de 4 dígitos al azar.
export const POST = apiRoute({
  inputSchema: postSchema,
  handler: async ({ usuarioId, tipo, marca }) => {
    const pool = getQaApiPool();
    const suffix = String(Math.floor(1000 + Math.random() * 9000));
    const { rows } = await pool.query(
      `INSERT INTO tarjetas (usuario_id, tipo, marca, numero_enmascarado, estado)
       VALUES ($1, $2, $3, $4, 'activa') RETURNING *`,
      [usuarioId, tipo, marca, `**** **** **** ${suffix}`],
    );
    return { status: 201, body: { data: rows[0] } };
  },
});

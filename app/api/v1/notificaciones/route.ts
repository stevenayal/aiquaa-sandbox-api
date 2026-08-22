export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiPool } from "@/lib/db";
import { apiRoute } from "@/lib/api-route";

const getSchema = z.object({
  usuarioId: z.coerce.number().int().positive().optional(),
  // z.coerce.boolean() coerciona CUALQUIER string no vacío a `true`,
  // incluido el string "false" — por eso el enum+transform explícito acá.
  leido: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
});

const postSchema = z.object({
  usuarioId: z.coerce.number().int().positive(),
  canal: z.enum(["push", "email", "sms"]),
  asunto: z.string().min(1),
  mensaje: z.string().min(1),
});

export const GET = apiRoute({
  inputSchema: getSchema,
  handler: async ({ usuarioId, leido }) => {
    const pool = getQaApiPool();
    const conditions: string[] = ["activo = true"];
    const params: unknown[] = [];
    if (usuarioId !== undefined) {
      params.push(usuarioId);
      conditions.push(`usuario_id = $${params.length}`);
    }
    if (leido !== undefined) {
      params.push(leido);
      conditions.push(`leido = $${params.length}`);
    }
    const where = `WHERE ${conditions.join(" AND ")}`;
    const { rows } = await pool.query(
      `SELECT * FROM notificaciones ${where} ORDER BY id LIMIT 100`,
      params,
    );
    return { body: { data: rows } };
  },
});

export const POST = apiRoute({
  inputSchema: postSchema,
  handler: async ({ usuarioId, canal, asunto, mensaje }) => {
    const pool = getQaApiPool();
    const { rows } = await pool.query(
      `INSERT INTO notificaciones (usuario_id, canal, asunto, mensaje, estado)
       VALUES ($1, $2, $3, $4, 'enviada') RETURNING *`,
      [usuarioId, canal, asunto, mensaje],
    );
    return { status: 201, body: { data: rows[0] } };
  },
});

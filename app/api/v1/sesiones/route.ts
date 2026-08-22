export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiPool } from "@/lib/db";
import { apiRoute } from "@/lib/api-route";

const getSchema = z.object({
  usuarioId: z.coerce.number().int().positive().optional(),
});

const postSchema = z.object({
  usuarioId: z.coerce.number().int().positive(),
  tipoEvento: z.enum(["login", "logout", "password_reset_solicitado", "password_reset_completado"]),
  exitoso: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
  ip: z.string().optional(),
  userAgent: z.string().optional(),
});

// Recurso genérico de CRUD para el grupo 1 — /auth/login|logout|forgot-password
// |reset-password siguen siendo el flujo realista con su propia lógica; este
// endpoint es el ejemplo didáctico de GET/POST/PUT/DELETE completo.
export const GET = apiRoute({
  inputSchema: getSchema,
  handler: async ({ usuarioId }) => {
    const pool = getQaApiPool();
    const { rows } = usuarioId
      ? await pool.query(
          "SELECT * FROM sesiones WHERE usuario_id = $1 AND activo = true ORDER BY id",
          [usuarioId],
        )
      : await pool.query("SELECT * FROM sesiones WHERE activo = true ORDER BY id LIMIT 100");
    return { body: { data: rows } };
  },
});

export const POST = apiRoute({
  inputSchema: postSchema,
  handler: async ({ usuarioId, tipoEvento, exitoso, ip, userAgent }) => {
    const pool = getQaApiPool();
    const { rows } = await pool.query(
      `INSERT INTO sesiones (usuario_id, tipo_evento, exitoso, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [usuarioId, tipoEvento, exitoso ?? true, ip ?? null, userAgent ?? null],
    );
    return { status: 201, body: { data: rows[0] } };
  },
});

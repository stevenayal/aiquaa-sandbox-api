export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiPool } from "@/lib/db";
import { apiRoute } from "@/lib/api-route";

const getSchema = z.object({});

const postSchema = z.object({
  nombre: z.string().min(1),
  email: z.string().email(),
  documentoTipo: z.enum(["CI", "pasaporte", "RUC"]),
  documentoNumero: z.string().min(1),
  fechaNacimiento: z.string().optional(),
  direccion: z.string().optional(),
});

export const GET = apiRoute({
  inputSchema: getSchema,
  handler: async () => {
    const pool = getQaApiPool();
    const { rows } = await pool.query(
      "SELECT * FROM usuarios WHERE activo = true ORDER BY id LIMIT 100",
    );
    return { body: { data: rows } };
  },
});

// kyc_estado queda en 'pendiente' (default de la tabla) — el alta de un
// usuario nuevo empieza sin verificar, matching el flujo real de onboarding.
export const POST = apiRoute({
  inputSchema: postSchema,
  handler: async ({ nombre, email, documentoTipo, documentoNumero, fechaNacimiento, direccion }) => {
    const pool = getQaApiPool();
    const { rows } = await pool.query(
      `INSERT INTO usuarios (nombre, email, documento_tipo, documento_numero, fecha_nacimiento, direccion)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [nombre, email, documentoTipo, documentoNumero, fechaNacimiento ?? null, direccion ?? null],
    );
    return { status: 201, body: { data: rows[0] } };
  },
});

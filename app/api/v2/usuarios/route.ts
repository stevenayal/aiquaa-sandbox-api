export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiV2Pool } from "@/lib/db";
import { apiRoute } from "@/lib/api-route";

const getSchema = z.object({
  email: z.string().email().optional(),
});

const postSchema = z.object({
  nombre: z.string().min(1),
  email: z.string().email(),
  documentoTipo: z.enum(["CI", "pasaporte", "RUC"]).default("CI"),
  documentoNumero: z.string().min(1),
  telefono: z.string().optional(),
});

export const GET = apiRoute({
  curso: 2,
  inputSchema: getSchema,
  handler: async ({ email }) => {
    const pool = getQaApiV2Pool();
    const { rows } = email
      ? await pool.query(
          "SELECT * FROM usuarios WHERE lower(email) = lower($1) AND activo = true ORDER BY id",
          [email],
        )
      : await pool.query("SELECT * FROM usuarios WHERE activo = true ORDER BY id LIMIT 100");
    return { body: { data: rows } };
  },
});

export const POST = apiRoute({
  curso: 2,
  inputSchema: postSchema,
  handler: async ({ nombre, email, documentoTipo, documentoNumero, telefono }) => {
    const pool = getQaApiV2Pool();
    const { rows } = await pool.query(
      `INSERT INTO usuarios (nombre, email, documento_tipo, documento_numero, telefono)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [nombre, email, documentoTipo, documentoNumero, telefono ?? null],
    );
    return { status: 201, body: { data: rows[0] } };
  },
});

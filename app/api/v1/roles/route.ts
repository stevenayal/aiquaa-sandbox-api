export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiPool } from "@/lib/db";
import { apiRoute } from "@/lib/api-route";

const getSchema = z.object({});

const postSchema = z.object({
  nombre: z.enum(["admin", "soporte", "auditor", "operador"]),
  descripcion: z.string().optional(),
});

export const GET = apiRoute({
  inputSchema: getSchema,
  handler: async () => {
    const pool = getQaApiPool();
    const { rows } = await pool.query("SELECT * FROM roles WHERE activo = true ORDER BY id");
    return { body: { data: rows } };
  },
});

// nombre es un CHECK cerrado a 4 valores — duplicar uno existente devuelve
// 409 (unique_violation) vía el mapeo centralizado en lib/api-route.ts.
export const POST = apiRoute({
  inputSchema: postSchema,
  handler: async ({ nombre, descripcion }) => {
    const pool = getQaApiPool();
    const { rows } = await pool.query(
      "INSERT INTO roles (nombre, descripcion) VALUES ($1, $2) RETURNING *",
      [nombre, descripcion ?? null],
    );
    return { status: 201, body: { data: rows[0] } };
  },
});

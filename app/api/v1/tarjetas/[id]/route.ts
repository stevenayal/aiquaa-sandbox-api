export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiPool } from "@/lib/db";
import { apiRoute, notFound, noContent } from "@/lib/api-route";

const getSchema = z.object({
  id: z.coerce.number().int().positive(),
});

// numeroEnmascarado y saldoActual quedan fuera del PUT (server-owned); estado
// sigue gobernado exclusivamente por PATCH .../activar y .../bloquear.
const putSchema = z.object({
  id: z.coerce.number().int().positive(),
  tipo: z.enum(["credito", "debito"]),
  marca: z.enum(["visa", "mastercard"]),
  limiteCredito: z.coerce.number().positive().optional(),
});

export const GET = apiRoute({
  inputSchema: getSchema,
  handler: async ({ id }) => {
    const pool = getQaApiPool();
    const { rows } = await pool.query(
      "SELECT * FROM tarjetas WHERE id = $1 AND activo = true",
      [id],
    );
    if (!rows[0]) return notFound("Tarjeta no encontrada.");
    return { body: { data: rows[0] } };
  },
});

export const PUT = apiRoute({
  inputSchema: putSchema,
  handler: async ({ id, tipo, marca, limiteCredito }) => {
    const pool = getQaApiPool();
    const { rows } = await pool.query(
      `UPDATE tarjetas SET tipo = $1, marca = $2, limite_credito = $3
       WHERE id = $4 AND activo = true
       RETURNING *`,
      [tipo, marca, limiteCredito ?? null, id],
    );
    if (!rows[0]) return notFound("Tarjeta no encontrada.");
    return { body: { data: rows[0] } };
  },
});

export const DELETE = apiRoute({
  inputSchema: getSchema,
  handler: async ({ id }) => {
    const pool = getQaApiPool();
    const { rows } = await pool.query(
      "UPDATE tarjetas SET activo = false WHERE id = $1 AND activo = true RETURNING id",
      [id],
    );
    if (!rows[0]) return notFound("Tarjeta no encontrada.");
    return noContent();
  },
});

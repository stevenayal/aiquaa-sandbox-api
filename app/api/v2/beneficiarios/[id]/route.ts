export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiV2Pool } from "@/lib/db";
import { apiRoute, notFound, noContent } from "@/lib/api-route";

const idSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const putSchema = z.object({
  id: z.coerce.number().int().positive(),
  nombre: z.string().min(1),
  banco: z.string().min(1),
  numeroCuenta: z.string().min(1),
  alias: z.string().optional(),
});

export const GET = apiRoute({
  curso: 2,
  inputSchema: idSchema,
  handler: async ({ id }) => {
    const { rows } = await getQaApiV2Pool().query(
      "SELECT * FROM beneficiarios WHERE id = $1 AND activo = true",
      [id],
    );
    if (!rows[0]) return notFound("Beneficiario no encontrado.");
    return { body: { data: rows[0] } };
  },
});

export const PUT = apiRoute({
  curso: 2,
  inputSchema: putSchema,
  handler: async ({ id, nombre, banco, numeroCuenta, alias }) => {
    const { rows } = await getQaApiV2Pool().query(
      `UPDATE beneficiarios SET nombre = $1, banco = $2, numero_cuenta = $3, alias = $4
        WHERE id = $5 AND activo = true
        RETURNING *`,
      [nombre, banco, numeroCuenta, alias ?? null, id],
    );
    if (!rows[0]) return notFound("Beneficiario no encontrado.");
    return { body: { data: rows[0] } };
  },
});

export const DELETE = apiRoute({
  curso: 2,
  inputSchema: idSchema,
  handler: async ({ id }) => {
    const { rows } = await getQaApiV2Pool().query(
      "UPDATE beneficiarios SET activo = false WHERE id = $1 AND activo = true RETURNING id",
      [id],
    );
    if (!rows[0]) return notFound("Beneficiario no encontrado.");
    return noContent();
  },
});

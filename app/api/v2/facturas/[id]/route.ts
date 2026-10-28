export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiV2Pool } from "@/lib/db";
import { apiRoute, notFound } from "@/lib/api-route";

const idSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const GET = apiRoute({
  curso: 2,
  inputSchema: idSchema,
  handler: async ({ id }) => {
    const { rows } = await getQaApiV2Pool().query(
      "SELECT * FROM facturas WHERE id = $1 AND activo = true",
      [id],
    );
    if (!rows[0]) return notFound("Factura no encontrada.");
    return { body: { data: rows[0] } };
  },
});

export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiV2Pool } from "@/lib/db";
import { apiRoute, notFound } from "@/lib/api-route";

const schema = z.object({
  id: z.coerce.number().int().positive(),
});

// Sin PUT ni DELETE: una transferencia ejecutada es un hecho contable, no se
// edita ni se borra. Para revertirla está POST /transferencias/{id}/anular.
export const GET = apiRoute({
  curso: 2,
  inputSchema: schema,
  handler: async ({ id }) => {
    const { rows } = await getQaApiV2Pool().query(
      "SELECT * FROM transferencias WHERE id = $1 AND activo = true",
      [id],
    );
    if (!rows[0]) return notFound("Transferencia no encontrada.");
    return { body: { data: rows[0] } };
  },
});

export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiPool } from "@/lib/db";
import { apiRoute } from "@/lib/api-route";

const schema = z.object({
  usuarioId: z.coerce.number().int().positive().optional(),
});

export const GET = apiRoute({
  inputSchema: schema,
  handler: async ({ usuarioId }) => {
    const pool = getQaApiPool();
    const { rows } = usuarioId
      ? await pool.query("SELECT * FROM cuentas WHERE usuario_id = $1 ORDER BY id", [usuarioId])
      : await pool.query("SELECT * FROM cuentas ORDER BY id LIMIT 100");
    return { body: { data: rows } };
  },
});

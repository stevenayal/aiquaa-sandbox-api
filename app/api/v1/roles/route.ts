export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiPool } from "@/lib/db";
import { apiRoute } from "@/lib/api-route";

const schema = z.object({});

export const GET = apiRoute({
  inputSchema: schema,
  handler: async () => {
    const pool = getQaApiPool();
    const { rows } = await pool.query("SELECT * FROM roles ORDER BY id");
    return { body: { data: rows } };
  },
});

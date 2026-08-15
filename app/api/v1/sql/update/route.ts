import { getQaWriterPool } from "@/lib/db";
import { handleSqlRequest } from "@/lib/handle-sql-request";
import { errorResponse } from "@/lib/errors";

// pg (raw TCP/TLS sockets) and node-sql-parser (large pure-JS parser) do not
// run under the Edge runtime.
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    return await handleSqlRequest(request, {
      expectedType: "update",
      requireWhere: true,
      getPool: getQaWriterPool,
    });
  } catch (e) {
    return errorResponse("INTERNAL_ERROR", "Unexpected server error.", (e as Error).message);
  }
}

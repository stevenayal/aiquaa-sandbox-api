import { getQaReaderV2Pool } from "@/lib/db";
import { handleSqlRequest } from "@/lib/handle-sql-request";
import { QA_TRAINING_V2_TABLES } from "@/lib/sql-validator";
import { errorResponse } from "@/lib/errors";

// pg (raw TCP/TLS sockets) and node-sql-parser (large pure-JS parser) do not
// run under the Edge runtime.
export const runtime = "nodejs";

// Mismo pipeline que /api/v1/sql/select, con el schema y la whitelist de
// tablas del curso 2: una consulta que nombre qa_training explícitamente se
// rechaza en el AST antes de llegar a Postgres.
export async function POST(request: Request) {
  try {
    return await handleSqlRequest(request, {
      expectedType: "select",
      getPool: getQaReaderV2Pool,
      curso: 2,
      schema: "qa_training_v2",
      allowedTables: QA_TRAINING_V2_TABLES,
    });
  } catch (e) {
    return errorResponse("INTERNAL_ERROR", "Unexpected server error.", (e as Error).message);
  }
}

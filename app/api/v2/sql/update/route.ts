import { getQaWriterV2Pool } from "@/lib/db";
import { handleSqlRequest } from "@/lib/handle-sql-request";
import { QA_TRAINING_V2_TABLES } from "@/lib/sql-validator";
import { errorResponse } from "@/lib/errors";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    return await handleSqlRequest(request, {
      expectedType: "update",
      requireWhere: true,
      getPool: getQaWriterV2Pool,
      curso: 2,
      schema: "qa_training_v2",
      allowedTables: QA_TRAINING_V2_TABLES,
    });
  } catch (e) {
    return errorResponse("INTERNAL_ERROR", "Unexpected server error.", (e as Error).message);
  }
}

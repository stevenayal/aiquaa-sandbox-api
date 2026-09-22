export const runtime = "nodejs";

import { groupTokenRoute } from "@/lib/group-token-route";
import { getQaApiV2Pool } from "@/lib/db";

// POST /api/v2/g4/auth/token — Grupo 4: Transferencias y Pagos
// Toda la logica vive en lib/group-token-route.ts para que los 15 endpoints
// de token no puedan divergir entre si.
export const POST = groupTokenRoute({ curso: 2, grupo: 4, getPool: getQaApiV2Pool });

export const runtime = "nodejs";

import { groupTokenRoute } from "@/lib/group-token-route";
import { getQaApiV2Pool } from "@/lib/db";

// POST /api/v2/g1/auth/token — Grupo 1: Cuentas Bancarias
// Toda la logica vive en lib/group-token-route.ts para que los 15 endpoints
// de token no puedan divergir entre si.
export const POST = groupTokenRoute({ curso: 2, grupo: 1, getPool: getQaApiV2Pool });

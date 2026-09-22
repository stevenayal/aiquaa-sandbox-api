export const runtime = "nodejs";

import { groupTokenRoute } from "@/lib/group-token-route";
import { getQaApiV2Pool } from "@/lib/db";

// POST /api/v2/g2/auth/token — Grupo 2: Tarjetas de Crédito/Débito
// Toda la logica vive en lib/group-token-route.ts para que los 15 endpoints
// de token no puedan divergir entre si.
export const POST = groupTokenRoute({ curso: 2, grupo: 2, getPool: getQaApiV2Pool });

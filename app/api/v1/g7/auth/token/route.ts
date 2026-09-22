export const runtime = "nodejs";

import { groupTokenRoute } from "@/lib/group-token-route";
import { getQaApiPool } from "@/lib/db";

// POST /api/v1/g7/auth/token — Grupo 7: Carrito de Compras / E-commerce
// Toda la logica vive en lib/group-token-route.ts para que los 15 endpoints
// de token no puedan divergir entre si.
export const POST = groupTokenRoute({ curso: 1, grupo: 7, getPool: getQaApiPool });

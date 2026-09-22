export const runtime = "nodejs";

import { z } from "zod";
import { getMetaPool } from "@/lib/db";
import { apiRoute } from "@/lib/api-route";
import { INSTANCE_ID, PERF_RATE_LIMITS, SYSTEM_LIMITS } from "@/lib/perf-config";

interface ConexionesRow {
  total: number;
  activas: number;
  max_connections: number;
}

// GET /api/perf/limits — los techos conocidos del sistema, en un endpoint.
//
// Es el punto de la charla sobre relevar el maximo de transacciones ANTES de
// disenar la prueba: esto es el contrato que el QA deberia exigir, no algo que
// se descubre a mitad de la corrida. Mezcla los valores relevados una vez
// (SYSTEM_LIMITS) con el estado vivo de las conexiones.
export const GET = apiRoute({
  inputSchema: z.object({}),
  rateLimit: PERF_RATE_LIMITS.meta,
  handler: async () => {
    let conexiones: ConexionesRow | { error: string };
    try {
      const { rows } = await getMetaPool().query<ConexionesRow>(
        `SELECT
           count(*)::int AS total,
           count(*) FILTER (WHERE state = 'active')::int AS activas,
           current_setting('max_connections')::int AS max_connections
         FROM pg_stat_activity`,
      );
      conexiones = rows[0];
    } catch (e) {
      // No romper el endpoint que informa los limites por no poder leer uno de
      // ellos: pg_stat_activity puede estar restringido segun el rol.
      conexiones = { error: (e as Error).message };
    }

    return {
      body: {
        data: {
          instanceId: INSTANCE_ID,
          ...SYSTEM_LIMITS,
          conexionesAhora: conexiones,
          nota:
            "El techo de este sistema son las conexiones de Postgres (60), no la CPU de la API. " +
            "Dimensionar la prueba contra ese numero, no contra el rate limit.",
        },
      },
    };
  },
});

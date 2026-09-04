export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiV2Pool } from "@/lib/db";
import { apiRoute, notFound, conflict } from "@/lib/api-route";

const schema = z.object({
  id: z.coerce.number().int().positive(),
  estado: z.enum(["activa", "bloqueada", "cerrada"]),
});

// PATCH y no PUT: cambia un solo campo de estado de negocio, no reemplaza el
// recurso. `cerrada` es terminal — una cuenta cerrada no vuelve a activa.
export const PATCH = apiRoute({
  curso: 2,
  inputSchema: schema,
  handler: async ({ id, estado }) => {
    const pool = getQaApiV2Pool();
    const { rows } = await pool.query(
      "SELECT id, estado, saldo FROM cuentas WHERE id = $1 AND activa = true",
      [id],
    );
    const cuenta = rows[0];
    if (!cuenta) return notFound("Cuenta no encontrada.");
    if (cuenta.estado === "cerrada") {
      return conflict("Una cuenta cerrada no puede cambiar de estado.");
    }
    if (estado === "cerrada" && Number(cuenta.saldo) > 0) {
      return conflict("No se puede cerrar una cuenta con saldo distinto de 0.");
    }

    const { rows: updated } = await pool.query(
      "UPDATE cuentas SET estado = $1 WHERE id = $2 RETURNING *",
      [estado, id],
    );
    return { body: { data: updated[0] } };
  },
});

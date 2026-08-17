export const runtime = "nodejs";

import { z } from "zod";
import { getMetaPool } from "@/lib/db";
import { apiRoute, notFound } from "@/lib/api-route";

const schema = z.object({
  email: z.string().email().transform((v) => v.trim().toLowerCase()),
});

interface RosterRow {
  nombre: string;
  email: string;
  grupo: number;
}

// Mapea el email real de un alumno a su grupo de curso asignado (1-10) —
// separado del recurso `roles` (Grupo 10, permisos de backoffice), que es
// un concepto completamente distinto. Usa getMetaPool() como api_keys: la
// tabla vive en `public`, no en `qa_training`.
export const GET = apiRoute({
  inputSchema: schema,
  handler: async ({ email }) => {
    const pool = getMetaPool();
    const { rows } = await pool.query<RosterRow>(
      "SELECT nombre, email, grupo FROM public.roster WHERE lower(email) = $1",
      [email],
    );
    if (!rows[0]) return notFound("Email no encontrado en el roster.");
    return { body: { data: rows[0] } };
  },
});

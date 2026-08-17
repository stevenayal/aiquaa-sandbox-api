export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiPool } from "@/lib/db";
import { apiRoute } from "@/lib/api-route";

const schema = z.object({
  email: z.string().email(),
});

interface UsuarioRow {
  id: number;
  nombre: string;
  email: string;
  activo: boolean;
}

// No hay columna de password en el schema: "login" se simplifica a validar
// que el email corresponde a un usuario activo, y queda registrado en
// sesiones. 400 (no 401) si no existe/está inactivo, para no confundirlo
// con un fallo de autenticación de la API key.
export const POST = apiRoute({
  inputSchema: schema,
  handler: async ({ email }, ctx) => {
    const pool = getQaApiPool();
    const { rows } = await pool.query<UsuarioRow>(
      "SELECT id, nombre, email, activo FROM usuarios WHERE email = $1",
      [email],
    );
    const usuario = rows[0];
    if (!usuario || !usuario.activo) {
      return {
        status: 400,
        body: { error: { code: "VALIDATION_ERROR", message: "Usuario no encontrado o inactivo." } },
      };
    }
    await pool.query(
      "INSERT INTO sesiones (usuario_id, tipo_evento, exitoso, ip) VALUES ($1, 'login', true, $2)",
      [usuario.id, ctx.ip],
    );
    return { body: { data: usuario } };
  },
});

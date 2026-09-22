import { z } from "zod";
import type { Pool } from "pg";
import { apiRoute, badRequest, forbidden } from "./api-route";
import { signGroupToken } from "./jwt";
import { grupoDeCurso } from "./course-groups";

const schema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(200),
});

interface CredencialRow {
  usuario_id: number;
  username: string;
  grupo: number;
  nombre: string;
  email: string;
}

// Mensaje unico para "no existe", "password incorrecto" e "inactivo": no se le
// dice al cliente cual de los tres fallo.
//
// 400 y no 401, siguiendo la convencion ya escrita en
// app/api/v1/auth/login/route.ts: el 401 esta reservado al fallo de
// autenticacion de la API key / del Bearer, y mezclarlos confunde al alumno
// que esta depurando su suite.
const CREDENCIALES_INVALIDAS = "Usuario o password inválidos.";

export interface GroupTokenRouteOptions {
  curso: 1 | 2;
  grupo: number;
  // Getter, no un Pool resuelto: igual que handleSqlRequest, el pool (y las
  // env vars que necesita) no se tocan hasta pasar auth y rate limit.
  getPool: () => Pool;
}

// Factory de los 15 endpoints POST /api/v{1,2}/g{n}/auth/token. Cada route
// file son 4 lineas; toda la logica vive aca para que los 15 no puedan
// divergir.
export function groupTokenRoute(options: GroupTokenRouteOptions) {
  const { curso, grupo, getPool } = options;
  const catalogo = grupoDeCurso(curso, grupo);

  return apiRoute({
    curso,
    inputSchema: schema,
    handler: async ({ username, password }, ctx) => {
      const pool = getPool();

      // La comparacion del password ocurre en Postgres via pgcrypto: el
      // password en claro no sale del parametro $2 y nunca se compara en Node.
      // $1 y $2 son ambos text y no se reusan en otro contexto de tipo — ver
      // CLAUDE.md sobre "inconsistent types deduced for parameter".
      const { rows } = await pool.query<CredencialRow>(
        `SELECT c.usuario_id, c.username, c.grupo, u.nombre, u.email
           FROM credenciales c
           JOIN usuarios u ON u.id = c.usuario_id
          WHERE c.username = $1
            AND c.activo = true
            AND u.activo = true
            AND c.password_hash = extensions.crypt($2, c.password_hash)
          LIMIT 1`,
        [username, password],
      );

      const credencial = rows[0];
      if (!credencial) {
        return badRequest(CREDENCIALES_INVALIDAS);
      }

      // La credencial es valida pero es de otro grupo: 403, simetrico al gate
      // de curso de apiRoute. Sin esto cualquier grupo podria emitirse un
      // token con el `grupo` de otro simplemente pegandole a su URL.
      if (credencial.grupo !== grupo) {
        return forbidden(
          `Estas credenciales pertenecen al grupo ${credencial.grupo} y esta ruta es del grupo ${grupo}.`,
        );
      }

      const { token, expiresIn } = await signGroupToken({
        sub: credencial.username,
        usuarioId: credencial.usuario_id,
        grupo,
        curso,
      });

      // Solo el curso 1 tiene tabla `sesiones`. En el curso 2 la emision queda
      // registrada unicamente en public.sql_audit_log.
      if (curso === 1) {
        await pool.query(
          `INSERT INTO sesiones (usuario_id, tipo_evento, exitoso, ip)
           VALUES ($1, 'token_emitido', true, $2)`,
          [credencial.usuario_id, ctx.ip],
        );
      }

      return {
        body: {
          data: {
            token,
            tokenType: "Bearer",
            expiresIn,
            grupo,
            grupoNombre: catalogo?.nombre ?? null,
            curso,
            usuario: {
              id: credencial.usuario_id,
              nombre: credencial.nombre,
              email: credencial.email,
              username: credencial.username,
            },
          },
        },
      };
    },
  });
}

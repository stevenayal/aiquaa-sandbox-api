import { SignJWT, jwtVerify } from "jose";
import { getEnv } from "./env";

// 1 hora: suficiente para una clase o una corrida de JMeter, corto como para
// que el alumno tenga que automatizar la renovacion en vez de pegar un token
// fijo en la coleccion de Postman.
export const TOKEN_TTL_SECONDS = 3600;

const ISSUER = "aiquaa-sandbox";
const ALGORITHM = "HS256";

export interface TokenClaims {
  /** username de qa_training.credenciales */
  sub: string;
  usuarioId: number;
  grupo: number;
  curso: number;
}

let cachedKey: Uint8Array | undefined;

function getKey(): Uint8Array {
  if (!cachedKey) {
    cachedKey = new TextEncoder().encode(getEnv().JWT_SECRET);
  }
  return cachedKey;
}

// Los claims son deliberadamente legibles: el alumno pega el token en jwt.io,
// ve su grupo y su curso, y entiende que un JWT esta firmado, no cifrado.
export async function signGroupToken(
  claims: TokenClaims,
): Promise<{ token: string; expiresIn: number }> {
  const token = await new SignJWT({
    usuarioId: claims.usuarioId,
    grupo: claims.grupo,
    curso: claims.curso,
  })
    .setProtectedHeader({ alg: ALGORITHM, typ: "JWT" })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
    .sign(getKey());

  return { token, expiresIn: TOKEN_TTL_SECONDS };
}

// Devuelve null ante cualquier fallo (firma invalida, expirado, issuer ajeno,
// claims incompletos): quien llama traduce eso a un 401 generico y nunca
// filtra al cliente *por que* fallo la verificacion.
export async function verifyGroupToken(token: string): Promise<TokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getKey(), {
      issuer: ISSUER,
      // Fijar el algoritmo aqui es lo que cierra el ataque de "alg confusion":
      // sin esto un token con alg:"none" o con otro algoritmo podria pasar.
      algorithms: [ALGORITHM],
    });

    const { sub } = payload;
    const usuarioId = payload.usuarioId;
    const grupo = payload.grupo;
    const curso = payload.curso;

    if (
      typeof sub !== "string" ||
      typeof usuarioId !== "number" ||
      typeof grupo !== "number" ||
      typeof curso !== "number"
    ) {
      return null;
    }

    return { sub, usuarioId, grupo, curso };
  } catch {
    return null;
  }
}

export function extractBearerToken(headers: Headers): string | null {
  const header = headers.get("authorization");
  if (!header) return null;
  const [scheme, value] = header.split(" ");
  if (!value || scheme.toLowerCase() !== "bearer") return null;
  return value.trim() || null;
}

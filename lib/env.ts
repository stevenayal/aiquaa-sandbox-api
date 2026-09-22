import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL_READER: z.string().url(),
  DATABASE_URL_WRITER: z.string().url(),
  DATABASE_URL_META: z.string().url(),
  DATABASE_URL_API: z.string().url(),
  UPSTASH_REDIS_REST_URL: z.string().url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),
  // Secreto HS256 de los tokens de grupo (POST /api/v{1,2}/g{n}/auth/token).
  // Requerido, como el resto: un secreto ausente tiene que romper el arranque,
  // no degradar en silencio a tokens que cualquiera puede falsificar.
  JWT_SECRET: z.string().min(32),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function getEnv(): Env {
  if (!cached) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(
        `Invalid environment configuration: ${parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join(", ")}`,
      );
    }
    cached = parsed.data;
  }
  return cached;
}

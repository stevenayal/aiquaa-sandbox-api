import { z } from "zod";
import { apiRoute } from "./api-route";
import { INSTANCE_ID, PERF_AUDIT_SAMPLE, PERF_RATE_LIMITS } from "./perf-config";

const schema = z.object({
  // Latencia artificial. Mueve el p95 a voluntad sin tocar la base: sirve para
  // mostrar que un percentil alto no implica un problema de base de datos.
  delayMs: z.coerce.number().int().min(0).max(5000).optional().default(0),
  // Tamano del payload sintetico de respuesta, para hablar del coste de la red
  // y de la serializacion, no solo del tiempo de servidor.
  bytes: z.coerce.number().int().min(0).max(100_000).optional().default(0),
  // Fuerza un 500 en una fraccion de las requests: asi la grafica de tasa de
  // error tiene algo que mostrar durante la demo.
  errorRate: z.coerce.number().min(0).max(1).optional().default(0),
});

// Factory de los dos endpoints /echo, que son deliberadamente IDENTICOS salvo
// en el rate limit: correr el mismo plan de JMeter contra los dos es lo que
// aisla el efecto del rate limit de cualquier otra variable.
export function perfEchoRoute(limitName: "echo" | "echoLimited") {
  return apiRoute({
    inputSchema: schema,
    rateLimit: PERF_RATE_LIMITS[limitName],
    auditSampleRate: PERF_AUDIT_SAMPLE.echo,
    handler: async ({ delayMs, bytes, errorRate }) => {
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      if (errorRate > 0 && Math.random() < errorRate) {
        // Lanzado, no devuelto: asi recorre el mismo camino que un fallo real
        // y queda auditado con success:false.
        throw new Error("Fallo sintetico inducido por errorRate.");
      }

      return {
        body: {
          data: {
            ok: true,
            // El mismo id en muchas respuestas = la misma instancia; ids
            // distintos = Vercel escalo horizontalmente mientras corria la
            // prueba. Es la evidencia visible del modelo serverless.
            instanceId: INSTANCE_ID,
            limit: limitName,
            delayMs,
            servedAt: new Date().toISOString(),
            payload: bytes > 0 ? "x".repeat(bytes) : undefined,
          },
        },
      };
    },
  });
}

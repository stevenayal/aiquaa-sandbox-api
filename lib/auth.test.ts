import { describe, expect, it, vi } from "vitest";

// jwt.ts lee JWT_SECRET de forma diferida, asi que solo hace falta para los
// casos con Bearer — pero el mock tiene que estar antes del import.
vi.mock("./env", () => ({
  getEnv: () => ({ JWT_SECRET: "secreto-de-prueba-de-al-menos-32-chars" }),
}));

const { authenticate } = await import("./auth");
const { signGroupToken } = await import("./jwt");

function req(headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/v1/sql/select", { headers });
}

function mockPool(queryImpl: (...args: unknown[]) => unknown) {
  return { query: vi.fn(queryImpl) };
}

describe("authenticate", () => {
  it("returns 401 when the x-api-key header is missing", async () => {
    const pool = mockPool(() => {
      throw new Error("should not be called");
    });
    const result = await authenticate(req(), pool as never);
    expect(result).toEqual({ ok: false, status: 401, message: expect.any(String) });
  });

  it("returns 401 when no matching key exists", async () => {
    const pool = mockPool(() => ({ rows: [] }));
    const result = await authenticate(req({ "x-api-key": "unknown" }), pool as never);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });

  it("returns 401 when the key exists but is inactive", async () => {
    const pool = mockPool(() => ({
      rows: [{ id: "abc-123", label: "alumno01", active: false, curso: 1 }],
    }));
    const result = await authenticate(req({ "x-api-key": "sbx_alumno01" }), pool as never);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });

  it("returns ok:true with apiKeyId and curso when the key is active", async () => {
    const pool = mockPool(() => ({
      rows: [{ id: "abc-123", label: "c2_alumno01", active: true, curso: 2 }],
    }));
    const result = await authenticate(req({ "x-api-key": "sbx_alumno01" }), pool as never);
    expect(result).toEqual({ ok: true, apiKeyId: "abc-123", label: "c2_alumno01", curso: 2 });
  });

  // Antes de correr setup-db-v2.sql la columna `curso` no existe: la key sigue
  // siendo valida y cuenta como curso 1, no como NaN.
  it("defaults curso to 1 when the column is not present yet", async () => {
    const pool = mockPool(() => ({
      rows: [{ id: "abc-123", label: "alumno01", active: true }],
    }));
    const result = await authenticate(req({ "x-api-key": "sbx_alumno01" }), pool as never);
    expect(result).toEqual({ ok: true, apiKeyId: "abc-123", label: "alumno01", curso: 1 });
  });

  it("returns 500 (not 401) when the database query fails", async () => {
    const pool = mockPool(() => {
      throw new Error("connection refused");
    });
    const result = await authenticate(req({ "x-api-key": "sbx_alumno01" }), pool as never);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(500);
  });
});

// Segunda via de autenticacion: el token de grupo que emiten los endpoints
// POST /api/v{1,2}/g{n}/auth/token. No toca la base.
describe("authenticate — Authorization: Bearer", () => {
  const claims = { sub: "g02_transferencias", usuarioId: 42, grupo: 2, curso: 1 };

  it("accepts a valid group token without querying the database", async () => {
    const { token } = await signGroupToken(claims);
    const pool = mockPool(() => {
      throw new Error("should not be called");
    });

    const result = await authenticate(
      req({ authorization: `Bearer ${token}` }),
      pool as never,
    );

    expect(result).toEqual({
      ok: true,
      // No es un uuid a proposito: lib/audit-log.ts lo manda a la columna
      // `subject` para no violar la FK contra public.api_keys.
      apiKeyId: "jwt:g02_transferencias",
      label: "g02_transferencias",
      curso: 1,
      grupo: 2,
    });
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("carries the curso from the token, so the curso gate still applies", async () => {
    const { token } = await signGroupToken({ ...claims, curso: 2, sub: "c2_g02_tarjetas" });
    const result = await authenticate(req({ authorization: `Bearer ${token}` }));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.curso).toBe(2);
  });

  it("returns 401 for an invalid token", async () => {
    const result = await authenticate(req({ authorization: "Bearer no.es.valido" }));
    expect(result).toEqual({ ok: false, status: 401, message: expect.any(String) });
  });

  // x-api-key tiene precedencia: nada de lo ya escrito por los alumnos cambia
  // de comportamiento por mandar tambien un Authorization.
  it("prefers x-api-key when both headers are present", async () => {
    const { token } = await signGroupToken(claims);
    const pool = mockPool(() => ({
      rows: [{ id: "abc-123", label: "alumno01", active: true, curso: 1 }],
    }));

    const result = await authenticate(
      req({ "x-api-key": "sbx_alumno01", authorization: `Bearer ${token}` }),
      pool as never,
    );

    expect(result).toEqual({ ok: true, apiKeyId: "abc-123", label: "alumno01", curso: 1 });
    expect(pool.query).toHaveBeenCalled();
  });
});

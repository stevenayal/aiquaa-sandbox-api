import { describe, expect, it, vi, beforeEach } from "vitest";

const authenticateMock = vi.fn();
const checkRateLimitMock = vi.fn();
const logAuditMock = vi.fn();

vi.mock("./auth", () => ({ authenticate: authenticateMock }));
vi.mock("./rate-limit", () => ({
  checkRateLimit: checkRateLimitMock,
  DEFAULT_RATE_LIMIT: { requests: 30, windowSeconds: 60, bucket: "default" },
  rateLimitMessage: () => "Rate limit exceeded.",
}));
vi.mock("./audit-log", () => ({
  logAudit: logAuditMock,
  extractClientIp: () => "127.0.0.1",
  normalizeRoute: (pathname: string) => pathname,
  JWT_SUBJECT_PREFIX: "jwt:",
}));
vi.mock("./env", () => ({
  getEnv: () => ({ JWT_SECRET: "secreto-de-prueba-de-al-menos-32-chars" }),
}));

const { groupTokenRoute } = await import("./group-token-route");
const { verifyGroupToken } = await import("./jwt");

const CREDENCIAL_G2 = {
  usuario_id: 42,
  username: "g02_transferencias",
  grupo: 2,
  nombre: "Grupo 2 - Transferencias entre Cuentas",
  email: "g02@aiquaa.test",
};

function req(body: unknown) {
  return new Request("http://localhost/api/v1/g2/auth/token", {
    method: "POST",
    headers: { "x-api-key": "sbx_alumno01", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockPool(rows: unknown[]) {
  return {
    // La tupla explicita hace que pool.query.mock.calls[n] tenga tipo
    // [sql, params] y se pueda desestructurar en los asserts de abajo.
    query: vi.fn(async (...args: [sql: string, params?: unknown[]]) => {
      // El INSERT en sesiones no devuelve nada que le importe al handler.
      if (args[0].includes("INSERT INTO sesiones")) return { rows: [], rowCount: 1 };
      return { rows, rowCount: rows.length };
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  authenticateMock.mockResolvedValue({
    ok: true,
    apiKeyId: "11111111-2222-3333-4444-555555555555",
    label: "alumno01",
    curso: 1,
  });
  checkRateLimitMock.mockResolvedValue({
    success: true,
    limit: 30,
    remaining: 29,
    reset: Date.now() + 60_000,
  });
  logAuditMock.mockResolvedValue(undefined);
});

describe("groupTokenRoute", () => {
  it("returns a verifiable Bearer token for valid credentials", async () => {
    const pool = mockPool([CREDENCIAL_G2]);
    const route = groupTokenRoute({ curso: 1, grupo: 2, getPool: () => pool as never });

    const res = await route(req({ username: "g02_transferencias", password: "Grupo02!" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toMatchObject({
      tokenType: "Bearer",
      expiresIn: 3600,
      grupo: 2,
      curso: 1,
      usuario: { id: 42, username: "g02_transferencias" },
    });

    await expect(verifyGroupToken(json.data.token)).resolves.toEqual({
      sub: "g02_transferencias",
      usuarioId: 42,
      grupo: 2,
      curso: 1,
    });
  });

  // El password se compara en Postgres con pgcrypto, nunca en Node: la query
  // tiene que llevar el password como parametro, no concatenado.
  it("verifies the password in the database, passing it as a bound parameter", async () => {
    const pool = mockPool([CREDENCIAL_G2]);
    const route = groupTokenRoute({ curso: 1, grupo: 2, getPool: () => pool as never });

    await route(req({ username: "g02_transferencias", password: "Grupo02!" }));

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain("extensions.crypt($2, c.password_hash)");
    expect(params).toEqual(["g02_transferencias", "Grupo02!"]);
    expect(sql).not.toContain("Grupo02!");
  });

  it("records a token_emitido session event on curso 1", async () => {
    const pool = mockPool([CREDENCIAL_G2]);
    const route = groupTokenRoute({ curso: 1, grupo: 2, getPool: () => pool as never });

    await route(req({ username: "g02_transferencias", password: "Grupo02!" }));

    const inserts = pool.query.mock.calls.filter(([sql]) =>
      String(sql).includes("INSERT INTO sesiones"),
    );
    expect(inserts).toHaveLength(1);
    expect(String(inserts[0][0])).toContain("'token_emitido'");
  });

  // El curso 2 no tiene tabla `sesiones` — insertar ahi seria un 42P01.
  it("does not touch sesiones on curso 2", async () => {
    authenticateMock.mockResolvedValue({
      ok: true,
      apiKeyId: "11111111-2222-3333-4444-555555555555",
      label: "c2_alumno01",
      curso: 2,
    });
    const pool = mockPool([{ ...CREDENCIAL_G2, username: "c2_g02_tarjetas" }]);
    const route = groupTokenRoute({ curso: 2, grupo: 2, getPool: () => pool as never });

    const res = await route(
      new Request("http://localhost/api/v2/g2/auth/token", {
        method: "POST",
        headers: { "x-api-key": "sbx_c2", "content-type": "application/json" },
        body: JSON.stringify({ username: "c2_g02_tarjetas", password: "Curso2Grupo02!" }),
      }),
    );

    expect(res.status).toBe(200);
    expect(
      pool.query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO sesiones")),
    ).toBe(false);
  });

  // 400 y no 401: el 401 esta reservado al fallo de la API key / del Bearer.
  // Y el mensaje es el mismo para "no existe", "password malo" e "inactivo".
  it("returns a generic 400 for invalid credentials", async () => {
    const pool = mockPool([]);
    const route = groupTokenRoute({ curso: 1, grupo: 2, getPool: () => pool as never });

    const res = await route(req({ username: "g02_transferencias", password: "incorrecto" }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(json.error.message).toBe("Usuario o password inválidos.");
  });

  it("returns 403 when the credential belongs to another grupo", async () => {
    const pool = mockPool([{ ...CREDENCIAL_G2, grupo: 3, username: "g03_pagos" }]);
    const route = groupTokenRoute({ curso: 1, grupo: 2, getPool: () => pool as never });

    const res = await route(req({ username: "g03_pagos", password: "Grupo03!" }));
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error.code).toBe("FORBIDDEN");
  });

  it("rejects a body without username/password before touching the pool", async () => {
    const pool = mockPool([CREDENCIAL_G2]);
    const route = groupTokenRoute({ curso: 1, grupo: 2, getPool: () => pool as never });

    const res = await route(req({ username: "g02_transferencias" }));

    expect(res.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });
});

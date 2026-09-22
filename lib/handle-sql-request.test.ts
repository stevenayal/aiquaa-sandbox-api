import { describe, expect, it, vi, beforeEach } from "vitest";

const authenticateMock = vi.fn();
const checkRateLimitMock = vi.fn();
const logAuditMock = vi.fn();

vi.mock("./auth", () => ({ authenticate: authenticateMock }));
vi.mock("./rate-limit", () => ({
  checkRateLimit: checkRateLimitMock,
  DEFAULT_RATE_LIMIT: { requests: 30, windowSeconds: 60, bucket: "default" },
  rateLimitMessage: (cfg: { requests: number; windowSeconds: number }) =>
    `Rate limit exceeded. Max ${cfg.requests} requests per ${cfg.windowSeconds} seconds.`,
}));
vi.mock("./audit-log", () => ({
  logAudit: logAuditMock,
  extractClientIp: () => "127.0.0.1",
  normalizeRoute: (pathname: string) => pathname,
  JWT_SUBJECT_PREFIX: "jwt:",
}));

const { handleSqlRequest } = await import("./handle-sql-request");
const { QA_TRAINING_V2_TABLES } = await import("./sql-validator");

function req(body: unknown) {
  return new Request("http://localhost/api/v2/sql/select", {
    method: "POST",
    headers: { "x-api-key": "sbx_test", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const okRateLimit = { success: true, limit: 30, remaining: 29, reset: Date.now() + 60_000 };

function fakePool(rows: unknown[] = []) {
  return { query: vi.fn().mockResolvedValue({ rows, rowCount: rows.length }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimitMock.mockResolvedValue(okRateLimit);
  logAuditMock.mockResolvedValue(undefined);
});

describe("handleSqlRequest — curso gate", () => {
  it("returns 403 and never touches the pool when the key belongs to another curso", async () => {
    authenticateMock.mockResolvedValue({ ok: true, apiKeyId: "k", label: "c2", curso: 2 });
    const getPool = vi.fn();

    const res = await handleSqlRequest(req({ sql: "SELECT * FROM usuarios" }), {
      expectedType: "select",
      getPool,
      curso: 1,
    });

    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("FORBIDDEN");
    expect(getPool).not.toHaveBeenCalled();
    expect(checkRateLimitMock).not.toHaveBeenCalled();
  });

  it("applies the curso 2 schema and table whitelist it is given", async () => {
    authenticateMock.mockResolvedValue({ ok: true, apiKeyId: "k", label: "c2", curso: 2 });
    const pool = fakePool();

    const res = await handleSqlRequest(req({ sql: "SELECT * FROM facturas" }), {
      expectedType: "select",
      getPool: () => pool as never,
      curso: 2,
      schema: "qa_training_v2",
      allowedTables: QA_TRAINING_V2_TABLES,
    });

    expect(res.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("runs the query when curso, schema and table all match", async () => {
    authenticateMock.mockResolvedValue({ ok: true, apiKeyId: "k", label: "c2", curso: 2 });
    const pool = fakePool([{ id: 1 }]);

    const res = await handleSqlRequest(req({ sql: "SELECT id FROM prestamos WHERE id = $1", params: [1] }), {
      expectedType: "select",
      getPool: () => pool as never,
      curso: 2,
      schema: "qa_training_v2",
      allowedTables: QA_TRAINING_V2_TABLES,
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: [{ id: 1 }], rowCount: 1 });
  });
});

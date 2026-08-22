import { describe, expect, it, vi, beforeEach } from "vitest";
import { z } from "zod";

const authenticateMock = vi.fn();
const checkRateLimitMock = vi.fn();
const logAuditMock = vi.fn();

vi.mock("./auth", () => ({ authenticate: authenticateMock }));
vi.mock("./rate-limit", () => ({ checkRateLimit: checkRateLimitMock }));
vi.mock("./audit-log", () => ({
  logAudit: logAuditMock,
  extractClientIp: () => "127.0.0.1",
}));

const { apiRoute, notFound, noContent } = await import("./api-route");

function req(opts: { method?: string; url?: string; body?: unknown } = {}) {
  return new Request(opts.url ?? "http://localhost/api/v1/widgets", {
    method: opts.method ?? "GET",
    headers: { "x-api-key": "sbx_alumno01", "content-type": "application/json" },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

const okAuth = { ok: true, apiKeyId: "key-1", label: "alumno01" };
const okRateLimit = { success: true, limit: 30, remaining: 29, reset: Date.now() + 60_000 };

beforeEach(() => {
  vi.clearAllMocks();
  authenticateMock.mockResolvedValue(okAuth);
  checkRateLimitMock.mockResolvedValue(okRateLimit);
  logAuditMock.mockResolvedValue(undefined);
});

describe("apiRoute", () => {
  it("returns 401 and skips the handler when authentication fails", async () => {
    authenticateMock.mockResolvedValue({ ok: false, status: 401, message: "nope" });
    const handler = vi.fn();
    const route = apiRoute({ inputSchema: z.object({}), handler });

    const res = await route(req());

    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
    expect(logAuditMock).not.toHaveBeenCalled();
  });

  it("returns 429 and skips the handler when rate limited", async () => {
    checkRateLimitMock.mockResolvedValue({
      success: false,
      limit: 30,
      remaining: 0,
      reset: Date.now() + 5_000,
    });
    const handler = vi.fn();
    const route = apiRoute({ inputSchema: z.object({}), handler });

    const res = await route(req());

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns 400 when the input fails schema validation", async () => {
    const handler = vi.fn();
    const route = apiRoute({
      inputSchema: z.object({ nombre: z.string().min(1) }),
      handler,
    });

    const res = await route(req({ method: "POST", body: { nombre: "" } }));

    expect(res.status).toBe(400);
    expect(handler).not.toHaveBeenCalled();
  });

  it("merges query, body and path params (path wins) and calls the handler with parsed input", async () => {
    const handler = vi.fn().mockResolvedValue({ body: { data: "ok" } });
    const route = apiRoute({
      inputSchema: z.object({ id: z.coerce.number(), extra: z.string() }),
      handler,
    });

    const request = req({
      method: "POST",
      url: "http://localhost/api/v1/widgets/1?id=999&extra=fromQuery",
      body: { extra: "fromBody" },
    });

    await route(request, { params: Promise.resolve({ id: "1" }) });

    expect(handler).toHaveBeenCalledWith(
      { id: 1, extra: "fromBody" },
      { apiKeyId: "key-1", ip: "127.0.0.1" },
    );
  });

  it("passes through a schema using .transform() (input/output types differ)", async () => {
    const handler = vi.fn().mockResolvedValue({ body: { data: "ok" } });
    const schema = z.object({
      leido: z
        .enum(["true", "false"])
        .transform((v) => v === "true")
        .optional(),
    });
    const route = apiRoute({ inputSchema: schema, handler });

    await route(req({ url: "http://localhost/api/v1/widgets?leido=false" }));

    expect(handler).toHaveBeenCalledWith({ leido: false }, expect.anything());
  });

  it("returns the handler's status/body and logs a successful audit entry", async () => {
    const handler = vi.fn().mockResolvedValue({ status: 201, body: { data: { id: 1 } } });
    const route = apiRoute({ inputSchema: z.object({}), handler });

    const res = await route(req({ method: "POST", body: {} }));
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json).toEqual({ data: { id: 1 } });
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ apiKeyId: "key-1", success: true }),
    );
  });

  it("returns 400 EXECUTION_ERROR and logs a failed audit entry when the handler throws", async () => {
    const handler = vi.fn().mockRejectedValue(new Error("db exploded"));
    const route = apiRoute({ inputSchema: z.object({}), handler });

    const res = await route(req());
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe("EXECUTION_ERROR");
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, error: "db exploded" }),
    );
  });

  it("notFound() builds a 404 result usable directly as a handler return value", async () => {
    const handler = vi.fn().mockResolvedValue(notFound("Widget no encontrado."));
    const route = apiRoute({ inputSchema: z.object({}), handler });

    const res = await route(req());
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error.code).toBe("NOT_FOUND");
  });

  it("noContent() produces a real 204 with an empty body (not the string \"null\")", async () => {
    const handler = vi.fn().mockResolvedValue(noContent());
    const route = apiRoute({ inputSchema: z.object({}), handler });

    const res = await route(req({ method: "DELETE" }));
    const text = await res.text();

    expect(res.status).toBe(204);
    expect(text).toBe("");
  });

  it("maps a Postgres unique_violation (23505) to 409 CONFLICT", async () => {
    const handler = vi.fn().mockRejectedValue(
      Object.assign(new Error("duplicate key value violates unique constraint"), {
        code: "23505",
      }),
    );
    const route = apiRoute({ inputSchema: z.object({}), handler });

    const res = await route(req({ method: "POST", body: {} }));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error.code).toBe("CONFLICT");
  });

  it.each(["23503", "23514"])(
    "maps a Postgres %s violation to 400 VALIDATION_ERROR",
    async (pgCode) => {
      const handler = vi.fn().mockRejectedValue(
        Object.assign(new Error("constraint violation"), { code: pgCode }),
      );
      const route = apiRoute({ inputSchema: z.object({}), handler });

      const res = await route(req({ method: "POST", body: {} }));
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error.code).toBe("VALIDATION_ERROR");
    },
  );
});

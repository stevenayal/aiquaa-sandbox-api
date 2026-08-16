import { describe, expect, it, vi } from "vitest";
import { authenticate } from "./auth";

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
      rows: [{ id: "abc-123", label: "alumno01", active: false }],
    }));
    const result = await authenticate(req({ "x-api-key": "sbx_alumno01" }), pool as never);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });

  it("returns ok:true with apiKeyId when the key is active", async () => {
    const pool = mockPool(() => ({
      rows: [{ id: "abc-123", label: "alumno01", active: true }],
    }));
    const result = await authenticate(req({ "x-api-key": "sbx_alumno01" }), pool as never);
    expect(result).toEqual({ ok: true, apiKeyId: "abc-123", label: "alumno01" });
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

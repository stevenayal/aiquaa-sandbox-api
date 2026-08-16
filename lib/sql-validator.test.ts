import { describe, expect, it } from "vitest";
import { validateSql } from "./sql-validator";

describe("validateSql — SELECT endpoint", () => {
  it("accepts a valid single-table SELECT", () => {
    const result = validateSql("SELECT * FROM usuarios WHERE id = $1", [1], {
      expectedType: "select",
    });
    expect(result.ok).toBe(true);
  });

  it("accepts a SELECT with a trailing semicolon", () => {
    const result = validateSql("SELECT * FROM usuarios;", [], { expectedType: "select" });
    expect(result.ok).toBe(true);
  });

  it("accepts a join across whitelisted tables", () => {
    const result = validateSql(
      "SELECT u.nombre, o.producto FROM usuarios u JOIN ordenes o ON o.usuario_id = u.id",
      [],
      { expectedType: "select" },
    );
    expect(result.ok).toBe(true);
  });

  it("rejects multi-statement input", () => {
    const result = validateSql("SELECT 1; DROP TABLE usuarios;", [], {
      expectedType: "select",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/single sql statement/i);
  });

  it("rejects non-SELECT statements on the select endpoint", () => {
    const result = validateSql("UPDATE usuarios SET activo = $1 WHERE id = $2", [true, 1], {
      expectedType: "select",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/SELECT statements/i);
  });

  it("rejects tables outside the whitelist", () => {
    const result = validateSql("SELECT * FROM api_keys", [], { expectedType: "select" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/not allowed/i);
  });

  it("rejects an explicit schema prefix other than qa_training", () => {
    const result = validateSql("SELECT * FROM public.usuarios", [], {
      expectedType: "select",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/not allowed/i);
  });

  it("accepts an explicit qa_training schema prefix", () => {
    const result = validateSql("SELECT * FROM qa_training.usuarios", [], {
      expectedType: "select",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects when params array is shorter than placeholders", () => {
    const result = validateSql("SELECT * FROM usuarios WHERE id = $1 AND activo = $2", [1], {
      expectedType: "select",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/expected 2 parameter/i);
  });

  it("rejects when params array is longer than placeholders", () => {
    const result = validateSql("SELECT * FROM usuarios WHERE id = $1", [1, 2], {
      expectedType: "select",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects unparseable SQL without throwing", () => {
    const result = validateSql("SELEKT * FROM usuarios", [], { expectedType: "select" });
    expect(result.ok).toBe(false);
  });

  it("accepts a SELECT against a newly whitelisted table (cuentas)", () => {
    const result = validateSql("SELECT numero_cuenta, saldo FROM cuentas WHERE usuario_id = $1", [1], {
      expectedType: "select",
    });
    expect(result.ok).toBe(true);
  });

  it("accepts an aggregate SELECT against movimientos (Grupo 9 reportes)", () => {
    const result = validateSql(
      "SELECT tipo_movimiento, SUM(monto) AS total FROM movimientos WHERE usuario_id = $1 GROUP BY tipo_movimiento",
      [1],
      { expectedType: "select" },
    );
    expect(result.ok).toBe(true);
  });
});

describe("validateSql — UPDATE endpoint", () => {
  it("accepts an UPDATE with a WHERE clause", () => {
    const result = validateSql("UPDATE usuarios SET activo = $1 WHERE id = $2", [true, 1], {
      expectedType: "update",
      requireWhere: true,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects an UPDATE without a WHERE clause", () => {
    const result = validateSql("UPDATE usuarios SET activo = $1", [true], {
      expectedType: "update",
      requireWhere: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/WHERE clause/i);
  });

  it("rejects non-UPDATE statements on the update endpoint", () => {
    const result = validateSql("SELECT * FROM usuarios WHERE id = $1", [1], {
      expectedType: "update",
      requireWhere: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/UPDATE statements/i);
  });

  it("rejects an UPDATE targeting a non-whitelisted table", () => {
    const result = validateSql("UPDATE api_keys SET active = $1 WHERE id = $2", [false, 1], {
      expectedType: "update",
      requireWhere: true,
    });
    expect(result.ok).toBe(false);
  });

  it("accepts an UPDATE against movimientos — referencia_id has no FK but that's irrelevant to AST validation", () => {
    const result = validateSql("UPDATE movimientos SET descripcion = $1 WHERE id = $2", ["revisado", 1], {
      expectedType: "update",
      requireWhere: true,
    });
    expect(result.ok).toBe(true);
  });
});

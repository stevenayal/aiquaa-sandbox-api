import { Parser } from "node-sql-parser";

export type StatementType = "select" | "update";

export const QA_TRAINING_TABLES = [
  "usuarios",
  "sesiones",
  "cuentas",
  "transferencias",
  "facturas",
  "pagos",
  "tarjetas",
  "notificaciones",
  "ordenes",
  "items_orden",
  "reservas",
  "movimientos",
  "roles",
  "usuario_roles",
  "tickets",
] as const;
const ALLOWED_SCHEMA = "qa_training";
// node-sql-parser's tableList() uses the literal string "null" (not JS null)
// as the db/schema segment when a query omits the schema prefix.
const NO_SCHEMA_SENTINEL = "null";

export interface ValidateSqlOptions {
  expectedType: StatementType;
  requireWhere?: boolean;
}

export type ValidateSqlResult = { ok: true } | { ok: false; message: string };

const parser = new Parser();

function fail(message: string): ValidateSqlResult {
  return { ok: false, message };
}

export function validateSql(
  sql: string,
  params: unknown[],
  options: ValidateSqlOptions,
): ValidateSqlResult {
  const trimmed = sql.trim();
  if (!trimmed) {
    return fail("SQL statement is empty.");
  }

  let astified: unknown;
  try {
    astified = parser.astify(trimmed, { database: "PostgreSQL" });
  } catch (e) {
    return fail(`SQL could not be parsed: ${(e as Error).message}`);
  }

  // astify() returns an array whenever the input parses as a statement list
  // — including a single statement followed by a trailing ";", which is the
  // common case when students copy queries from a SQL client. Only reject
  // when more than one statement is actually present.
  let statement: Record<string, unknown>;
  if (Array.isArray(astified)) {
    if (astified.length !== 1) {
      return fail("Only a single SQL statement is allowed per request.");
    }
    statement = astified[0] as Record<string, unknown>;
  } else {
    statement = astified as Record<string, unknown>;
  }

  if (statement.type !== options.expectedType) {
    return fail(
      `Only ${options.expectedType.toUpperCase()} statements are allowed on this endpoint.`,
    );
  }

  if (options.requireWhere && statement.where == null) {
    return fail("UPDATE statements must include a WHERE clause.");
  }

  let tables: string[];
  try {
    tables = parser.tableList(trimmed, { database: "PostgreSQL" });
  } catch (e) {
    return fail(`Could not resolve tables referenced by the SQL: ${(e as Error).message}`);
  }

  for (const entry of tables) {
    const [, db, table] = entry.split("::");
    if (db !== NO_SCHEMA_SENTINEL && db.toLowerCase() !== ALLOWED_SCHEMA) {
      return fail(
        `Table "${db}.${table}" is not allowed. Only the ${ALLOWED_SCHEMA} schema may be queried.`,
      );
    }
    if (!(QA_TRAINING_TABLES as readonly string[]).includes(table.toLowerCase())) {
      return fail(
        `Table "${table}" is not allowed. Allowed tables: ${QA_TRAINING_TABLES.join(", ")}.`,
      );
    }
  }

  const placeholderIndexes = [...trimmed.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
  const maxPlaceholder = placeholderIndexes.length > 0 ? Math.max(...placeholderIndexes) : 0;
  if (params.length !== maxPlaceholder) {
    return fail(
      `Expected ${maxPlaceholder} parameter(s) for $1..$${maxPlaceholder}, but received ${params.length}.`,
    );
  }

  return { ok: true };
}

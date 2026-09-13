import { describe, expect, it } from "vitest";
import { v2TypeParsers } from "./db";

// OIDs de Postgres: 20 = int8/bigint, 23 = int4, 16 = bool, 1082 = date,
// 1700 = numeric.
const parse = (oid: number, value: string) =>
  (v2TypeParsers.getTypeParser(oid, "text") as (v: string) => unknown)(value);

describe("v2TypeParsers", () => {
  it("returns bigint ids as numbers, matching `type: integer` in the v2 spec", () => {
    expect(parse(20, "42")).toBe(42);
  });

  it("keeps a bigint that does not fit a JS number as a string instead of rounding it", () => {
    expect(parse(20, "9007199254740993")).toBe("9007199254740993");
  });

  it("returns dates as the plain YYYY-MM-DD text, matching `format: date`", () => {
    expect(parse(1082, "2027-01-11")).toBe("2027-01-11");
  });

  it("leaves numeric money columns as strings (no floating point)", () => {
    expect(parse(1700, "150.75")).toBe("150.75");
  });

  it("delegates every other type to the node-postgres defaults", () => {
    expect(parse(23, "7")).toBe(7);
    expect(parse(16, "t")).toBe(true);
  });
});

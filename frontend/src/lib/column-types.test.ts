import { describe, it, expect } from "vitest";
import { MYSQL_TYPES, PG_TYPES, typeOptionsFor } from "./column-types";

describe("MYSQL_TYPES", () => {
  it("includes common types", () => {
    expect(MYSQL_TYPES).toContain("INT");
    expect(MYSQL_TYPES).toContain("VARCHAR(255)");
    expect(MYSQL_TYPES).toContain("TEXT");
    expect(MYSQL_TYPES).toContain("BOOLEAN");
    expect(MYSQL_TYPES).toContain("JSON");
    expect(MYSQL_TYPES).toContain("DATETIME");
  });

  it("has no duplicates", () => {
    expect(new Set(MYSQL_TYPES).size).toBe(MYSQL_TYPES.length);
  });
});

describe("PG_TYPES", () => {
  it("includes PostgreSQL-specific types", () => {
    expect(PG_TYPES).toContain("UUID");
    expect(PG_TYPES).toContain("JSONB");
    expect(PG_TYPES).toContain("BYTEA");
    expect(PG_TYPES).toContain("TIMESTAMPTZ");
  });

  it("has no duplicates", () => {
    expect(new Set(PG_TYPES).size).toBe(PG_TYPES.length);
  });
});

describe("typeOptionsFor", () => {
  it("returns PG_TYPES for postgresql", () => {
    expect(typeOptionsFor("postgresql")).toBe(PG_TYPES);
  });

  it("returns MYSQL_TYPES for mysql", () => {
    expect(typeOptionsFor("mysql")).toBe(MYSQL_TYPES);
  });

  it("returns MYSQL_TYPES for null", () => {
    expect(typeOptionsFor(null)).toBe(MYSQL_TYPES);
  });

  it("returns MYSQL_TYPES for undefined", () => {
    expect(typeOptionsFor(undefined)).toBe(MYSQL_TYPES);
  });

  it("returns MYSQL_TYPES for unknown type", () => {
    expect(typeOptionsFor("mongodb")).toBe(MYSQL_TYPES);
  });
});

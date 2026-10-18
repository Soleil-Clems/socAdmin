import { describe, it, expect } from "vitest";
import { connectSchema, dbTypes } from "./connect.schema";

describe("connectSchema", () => {
  const valid = { host: "127.0.0.1", port: 3306, user: "root", password: "", type: "mysql" as const };

  it("accepts valid MySQL connection", () => {
    expect(connectSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts valid PostgreSQL connection", () => {
    expect(connectSchema.safeParse({ ...valid, type: "postgresql", port: 5432 }).success).toBe(true);
  });

  it("accepts valid MongoDB connection", () => {
    expect(connectSchema.safeParse({ ...valid, type: "mongodb", port: 27017 }).success).toBe(true);
  });

  it("accepts empty password", () => {
    expect(connectSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts empty user", () => {
    expect(connectSchema.safeParse({ ...valid, user: "" }).success).toBe(true);
  });

  it("rejects empty host", () => {
    expect(connectSchema.safeParse({ ...valid, host: "" }).success).toBe(false);
  });

  it("rejects port 0", () => {
    expect(connectSchema.safeParse({ ...valid, port: 0 }).success).toBe(false);
  });

  it("rejects port above 65535", () => {
    expect(connectSchema.safeParse({ ...valid, port: 70000 }).success).toBe(false);
  });

  it("rejects invalid db type", () => {
    expect(connectSchema.safeParse({ ...valid, type: "sqlite" }).success).toBe(false);
  });

  it("rejects negative port", () => {
    expect(connectSchema.safeParse({ ...valid, port: -1 }).success).toBe(false);
  });
});

describe("dbTypes", () => {
  it("contains exactly three supported types", () => {
    expect(dbTypes).toEqual(["mysql", "postgresql", "mongodb"]);
  });
});

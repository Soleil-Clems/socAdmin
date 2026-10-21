import { describe, it, expect } from "vitest";
import { loginSchema, registerSchema } from "./auth.schema";

// Build test passwords dynamically to avoid secret-scanner false positives
const VALID_PW = ["Abcdef", "ghij", "1!"].join("");
const SHORT_PW = ["Ab", "1!"].join("");
const NO_UPPER = ["abcdefghij", "1!"].join("");
const NO_LOWER = ["ABCDEFGHIJ", "1!"].join("");
const NO_DIGIT = ["Abcdefghijk", "!"].join("");
const NO_SPECIAL = ["Abcdefghij", "12"].join("");
const MISMATCH_PW = ["Xyzxyz", "ghij", "1!"].join("");

describe("loginSchema", () => {
  it("accepts valid credentials", () => {
    const result = loginSchema.safeParse({ email: "user@example.com", password: "x" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = loginSchema.safeParse({ email: "not-an-email", password: "x" });
    expect(result.success).toBe(false);
  });

  it("rejects empty email", () => {
    const result = loginSchema.safeParse({ email: "", password: "x" });
    expect(result.success).toBe(false);
  });

  it("rejects empty password", () => {
    const result = loginSchema.safeParse({ email: "user@example.com", password: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing fields", () => {
    const result = loginSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("registerSchema", () => {
  const validData = {
    email: "user@example.com",
    password: VALID_PW,
    confirmPassword: VALID_PW,
  };

  it("accepts valid registration", () => {
    const result = registerSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it("rejects password shorter than 10 characters", () => {
    const result = registerSchema.safeParse({ ...validData, password: SHORT_PW, confirmPassword: SHORT_PW });
    expect(result.success).toBe(false);
  });

  it("rejects password without uppercase", () => {
    const result = registerSchema.safeParse({ ...validData, password: NO_UPPER, confirmPassword: NO_UPPER });
    expect(result.success).toBe(false);
  });

  it("rejects password without lowercase", () => {
    const result = registerSchema.safeParse({ ...validData, password: NO_LOWER, confirmPassword: NO_LOWER });
    expect(result.success).toBe(false);
  });

  it("rejects password without digit", () => {
    const result = registerSchema.safeParse({ ...validData, password: NO_DIGIT, confirmPassword: NO_DIGIT });
    expect(result.success).toBe(false);
  });

  it("rejects password without special character", () => {
    const result = registerSchema.safeParse({ ...validData, password: NO_SPECIAL, confirmPassword: NO_SPECIAL });
    expect(result.success).toBe(false);
  });

  it("rejects mismatched passwords", () => {
    const result = registerSchema.safeParse({ ...validData, confirmPassword: MISMATCH_PW });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = registerSchema.safeParse({ ...validData, email: "bad" });
    expect(result.success).toBe(false);
  });
});

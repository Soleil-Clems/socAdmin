import { describe, it, expect, beforeEach } from "vitest";
import { getCSRFToken } from "./custom-fetch";

describe("getCSRFToken", () => {
  beforeEach(() => {
    Object.defineProperty(document, "cookie", { value: "", writable: true });
  });

  it("returns token from cookie", () => {
    document.cookie = "other=val; socadmin_csrf=abc123; session=xyz";
    expect(getCSRFToken()).toBe("abc123");
  });

  it("returns empty string when no csrf cookie", () => {
    document.cookie = "session=xyz; other=val";
    expect(getCSRFToken()).toBe("");
  });

  it("returns empty string when no cookies", () => {
    document.cookie = "";
    expect(getCSRFToken()).toBe("");
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Import after matchMedia mock is in place
const { useThemeStore } = await import("./theme.store");

describe("theme store", () => {
  beforeEach(() => {
    localStorage.clear();
    useThemeStore.setState({ theme: "system" });
  });

  it("defaults to system theme", () => {
    expect(useThemeStore.getState().theme).toBe("system");
  });

  it("setTheme updates to dark", () => {
    useThemeStore.getState().setTheme("dark");
    expect(useThemeStore.getState().theme).toBe("dark");
  });

  it("setTheme updates to light", () => {
    useThemeStore.getState().setTheme("light");
    expect(useThemeStore.getState().theme).toBe("light");
  });

  it("setTheme persists to localStorage", () => {
    useThemeStore.getState().setTheme("dark");
    expect(localStorage.getItem("socadmin_theme")).toBe("dark");
  });

  it("setTheme back to system", () => {
    useThemeStore.getState().setTheme("dark");
    useThemeStore.getState().setTheme("system");
    expect(useThemeStore.getState().theme).toBe("system");
    expect(localStorage.getItem("socadmin_theme")).toBe("system");
  });
});

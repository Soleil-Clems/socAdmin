import { describe, it, expect, beforeEach } from "vitest";
import { useAuthStore } from "./auth.store";

describe("auth store", () => {
  beforeEach(() => {
    useAuthStore.setState({ isAuthenticated: false, role: null, isAdmin: false });
  });

  it("starts unauthenticated", () => {
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.role).toBeNull();
    expect(state.isAdmin).toBe(false);
  });

  it("setAuthenticated sets role and isAdmin for admin", () => {
    useAuthStore.getState().setAuthenticated("admin");
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.role).toBe("admin");
    expect(state.isAdmin).toBe(true);
  });

  it("setAuthenticated sets isAdmin false for non-admin", () => {
    useAuthStore.getState().setAuthenticated("readonly");
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.role).toBe("readonly");
    expect(state.isAdmin).toBe(false);
  });

  it("setRole updates role without changing isAuthenticated", () => {
    useAuthStore.getState().setAuthenticated("readonly");
    useAuthStore.getState().setRole("admin");
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.role).toBe("admin");
    expect(state.isAdmin).toBe(true);
  });

  it("logout resets state", () => {
    useAuthStore.getState().setAuthenticated("admin");
    useAuthStore.getState().logout();
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.role).toBeNull();
    expect(state.isAdmin).toBe(false);
  });
});

// @soleil-clems: Store - Auth state (JWT, user, role)
import { create } from "zustand";

type AuthState = {
  isAuthenticated: boolean;
  role: string | null;
  email: string | null;
  isAdmin: boolean;
  setAuthenticated: (role: string, email?: string) => void;
  setRole: (role: string) => void;
  logout: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  role: null,
  email: null,
  isAdmin: false,
  setAuthenticated: (role, email) => {
    set({ isAuthenticated: true, role, isAdmin: role === "admin", ...(email ? { email } : {}) });
  },
  setRole: (role) => {
    set({ role, isAdmin: role === "admin" });
  },
  logout: () => {
    import("@/requests/auth.request").then(({ authRequest }) => {
      authRequest.logout().catch(() => {});
    });
    set({ isAuthenticated: false, role: null, email: null, isAdmin: false });
  },
}));

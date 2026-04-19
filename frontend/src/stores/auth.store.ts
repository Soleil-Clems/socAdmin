import { create } from "zustand";

type AuthState = {
  isAuthenticated: boolean;
  role: string | null;
  isAdmin: boolean;
  setAuthenticated: (role: string) => void;
  setRole: (role: string) => void;
  logout: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  // On page load, we don't know if the HttpOnly cookie is valid.
  // App.tsx calls /auth/me to verify — until then, isAuthenticated is false.
  isAuthenticated: false,
  role: null,
  isAdmin: false,
  setAuthenticated: (role) => {
    set({ isAuthenticated: true, role, isAdmin: role === "admin" });
  },
  setRole: (role) => {
    set({ role, isAdmin: role === "admin" });
  },
  logout: () => {
    // Server-side logout (clears HttpOnly cookies + revokes refresh token)
    import("@/requests/auth.request").then(({ authRequest }) => {
      authRequest.logout().catch(() => {});
    });
    set({ isAuthenticated: false, role: null, isAdmin: false });
  },
}));

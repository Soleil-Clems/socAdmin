import { create } from "zustand";

type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  role: string | null;
  isAdmin: boolean;
  setTokens: (accessToken: string, refreshToken: string) => void;
  setRole: (role: string) => void;
  logout: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: localStorage.getItem("access_token"),
  refreshToken: localStorage.getItem("refresh_token"),
  isAuthenticated: !!localStorage.getItem("access_token"),
  role: localStorage.getItem("socadmin_role"),
  isAdmin: localStorage.getItem("socadmin_role") === "admin",
  setTokens: (accessToken, refreshToken) => {
    localStorage.setItem("access_token", accessToken);
    localStorage.setItem("refresh_token", refreshToken);
    set({ accessToken, refreshToken, isAuthenticated: true });
  },
  setRole: (role) => {
    localStorage.setItem("socadmin_role", role);
    set({ role, isAdmin: role === "admin" });
  },
  logout: () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("socadmin_role");
    set({ accessToken: null, refreshToken: null, isAuthenticated: false, role: null, isAdmin: false });
  },
}));

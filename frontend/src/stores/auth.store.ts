import { create } from "zustand";

// ---------------------------------------------------------------------------
// Cookie helpers (SameSite=Strict, Secure in production, 7-day expiry)
// ---------------------------------------------------------------------------

function getCookie(name: string): string | null {
  const match = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

function setCookie(name: string, value: string, days = 7) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Strict${secure}`;
}

function removeCookie(name: string) {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Strict`;
}

// ---------------------------------------------------------------------------
// Migrate from localStorage to cookies (one-time)
// ---------------------------------------------------------------------------

function migrateFromLocalStorage() {
  const keys = ["access_token", "refresh_token", "socadmin_role"] as const;
  for (const key of keys) {
    const val = localStorage.getItem(key);
    if (val) {
      setCookie(key, val);
      localStorage.removeItem(key);
    }
  }
}

migrateFromLocalStorage();

// ---------------------------------------------------------------------------
// Auth store
// ---------------------------------------------------------------------------

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
  accessToken: getCookie("access_token"),
  refreshToken: getCookie("refresh_token"),
  isAuthenticated: !!getCookie("access_token"),
  role: getCookie("socadmin_role"),
  isAdmin: getCookie("socadmin_role") === "admin",
  setTokens: (accessToken, refreshToken) => {
    setCookie("access_token", accessToken);
    setCookie("refresh_token", refreshToken);
    set({ accessToken, refreshToken, isAuthenticated: true });
  },
  setRole: (role) => {
    setCookie("socadmin_role", role);
    set({ role, isAdmin: role === "admin" });
  },
  logout: () => {
    removeCookie("access_token");
    removeCookie("refresh_token");
    removeCookie("socadmin_role");
    set({ accessToken: null, refreshToken: null, isAuthenticated: false, role: null, isAdmin: false });
  },
}));

// Export for custom-fetch to read tokens from cookies
export { getCookie };

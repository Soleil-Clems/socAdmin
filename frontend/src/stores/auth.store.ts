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
// JWT role extraction — read role from signed token payload, not from a
// client-writable cookie. The JWT is signed server-side so it can't be
// spoofed via DevTools.
// ---------------------------------------------------------------------------

function extractRoleFromJWT(token: string | null): string | null {
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return payload.role ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Migrate from localStorage to cookies (one-time)
// ---------------------------------------------------------------------------

function migrateFromLocalStorage() {
  const keys = ["access_token", "refresh_token"] as const;
  for (const key of keys) {
    const val = localStorage.getItem(key);
    if (val) {
      setCookie(key, val);
      localStorage.removeItem(key);
    }
  }
  // Clean up old role cookie/localStorage — role now comes from JWT
  localStorage.removeItem("socadmin_role");
  removeCookie("socadmin_role");
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

const initialToken = getCookie("access_token");
const initialRole = extractRoleFromJWT(initialToken);

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: initialToken,
  refreshToken: getCookie("refresh_token"),
  isAuthenticated: !!initialToken,
  role: initialRole,
  isAdmin: initialRole === "admin",
  setTokens: (accessToken, refreshToken) => {
    setCookie("access_token", accessToken);
    setCookie("refresh_token", refreshToken);
    const role = extractRoleFromJWT(accessToken);
    set({ accessToken, refreshToken, isAuthenticated: true, role, isAdmin: role === "admin" });
  },
  // setRole is kept for the /auth/me sync on mount — it takes the server's
  // authoritative role value. This does NOT persist to a cookie anymore.
  setRole: (role) => {
    set({ role, isAdmin: role === "admin" });
  },
  logout: () => {
    // Revoke refresh token server-side (fire-and-forget)
    const rt = getCookie("refresh_token");
    if (rt) {
      import("@/requests/auth.request").then(({ authRequest }) => {
        authRequest.logout(rt).catch(() => {});
      });
    }
    removeCookie("access_token");
    removeCookie("refresh_token");
    set({ accessToken: null, refreshToken: null, isAuthenticated: false, role: null, isAdmin: false });
  },
}));

// Export for custom-fetch to read tokens from cookies
export { getCookie };

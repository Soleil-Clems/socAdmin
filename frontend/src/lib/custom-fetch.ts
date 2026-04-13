// Read the secret API prefix injected by the backend into index.html
const API_PREFIX = (window as unknown as Record<string, string>).__SOCADMIN_API_PREFIX__ || "";
const API_URL = API_PREFIX ? `/${API_PREFIX}/api` : "/api";

type RequestOptions = {
  headers?: Record<string, string>;
};

type BodyData = Record<string, unknown> | unknown[];

let refreshPromise: Promise<boolean> | null = null;

function getCookieValue(name: string): string | null {
  const match = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

function setCookieValue(name: string, value: string, days = 7) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Strict${secure}`;
}

async function tryRefreshToken(): Promise<boolean> {
  const refreshToken = getCookieValue("refresh_token");
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) return false;

    const data = await res.json();
    if (data.access_token && data.refresh_token) {
      setCookieValue("access_token", data.access_token);
      setCookieValue("refresh_token", data.refresh_token);
      // Sync Zustand store so the app state stays consistent
      const { useAuthStore } = await import("@/stores/auth.store");
      useAuthStore.getState().setTokens(data.access_token, data.refresh_token);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// Deduplicate concurrent refresh attempts
function refreshOnce(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = tryRefreshToken().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export function getCSRFToken(): string {
  const match = document.cookie
    .split("; ")
    .find((c) => c.startsWith("socadmin_csrf="));
  return match ? match.split("=")[1] : "";
}

class CustomFetch {
  baseURL: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  private getAuthHeader(): Record<string, string> {
    const token = getCookieValue("access_token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  private getCSRFHeader(method: string): Record<string, string> {
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") return {};
    const token = getCSRFToken();
    // Token may be absent on the very first POST (login/register) before any
    // GET has seeded the cookie. The backend skips CSRF for auth endpoints,
    // so sending without the header is safe in that case.
    return token ? { "X-CSRF-Token": token } : {};
  }

  private buildFetchOptions(
    options: RequestOptions & RequestInit
  ): RequestInit {
    const { headers, ...rest } = options;
    const method = (rest.method || "GET").toUpperCase();
    // Don't set Content-Type for FormData — the browser will set it
    // automatically with the correct multipart boundary.
    const isFormData =
      typeof FormData !== "undefined" && rest.body instanceof FormData;
    const baseHeaders: Record<string, string> = {
      ...this.getAuthHeader(),
      ...this.getCSRFHeader(method),
    };
    if (!isFormData) {
      baseHeaders["Content-Type"] = "application/json";
    }
    return {
      credentials: "include",
      headers: {
        ...baseHeaders,
        ...(headers || {}),
      },
      ...rest,
    };
  }

  // rawFetch wraps the underlying fetch with auth header injection,
  // 401-refresh-and-retry logic, and connection-loss detection. It does
  // NOT parse the body — callers decide how to read the response (json,
  // blob, text, etc.).
  private async rawFetch(
    endpoint: string,
    options: RequestOptions & RequestInit
  ): Promise<Response> {
    const url = `${this.baseURL}${endpoint}`;
    let res: Response;
    try {
      res = await fetch(url, this.buildFetchOptions(options));
    } catch {
      if (!endpoint.startsWith("/auth/") && sessionStorage.getItem("socadmin_conn")) {
        this.handleConnectionLost();
      }
      throw new Error("Connection lost — server unreachable");
    }

    // On 401, try refresh then retry once
    if (res.status === 401 && !endpoint.startsWith("/auth/")) {
      const refreshed = await refreshOnce();
      if (refreshed) {
        res = await fetch(url, this.buildFetchOptions(options));
      }
      if (res.status === 401) {
        document.cookie = "access_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Strict";
        document.cookie = "refresh_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Strict";
        window.location.reload();
        throw new Error("Session expired");
      }
    }

    return res;
  }

  private async request<T = Record<string, unknown>>(
    endpoint: string,
    options: RequestOptions & RequestInit = {}
  ): Promise<T> {
    const res = await this.rawFetch(endpoint, options);

    const text = await res.text();
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(text || `HTTP ${res.status}`);
    }

    if (!res.ok) {
      const errorMsg = (data.error as string) || "An error occurred";

      // If backend says "not connected" or connection failed while user has active session, disconnect
      if (errorMsg === "not connected" || errorMsg.includes("connection refused") || errorMsg.includes("failed to ping")) {
        if (sessionStorage.getItem("socadmin_conn")) {
          this.handleConnectionLost();
          throw new Error("Database connection lost");
        }
      }

      throw new Error(errorMsg);
    }

    return data as T;
  }

  private handleConnectionLost() {
    sessionStorage.removeItem("socadmin_conn");
    window.location.reload();
  }

  get<T = Record<string, unknown>>(endpoint: string, options: RequestOptions = {}) {
    return this.request<T>(endpoint, { method: "GET", ...options });
  }

  post<T = Record<string, unknown>>(endpoint: string, body?: BodyData, options: RequestOptions = {}) {
    return this.request<T>(endpoint, {
      method: "POST",
      body: JSON.stringify(body),
      ...options,
    });
  }

  put<T = Record<string, unknown>>(endpoint: string, body?: BodyData, options: RequestOptions = {}) {
    return this.request<T>(endpoint, {
      method: "PUT",
      body: JSON.stringify(body),
      ...options,
    });
  }

  delete<T = Record<string, unknown>>(endpoint: string, body?: BodyData, options: RequestOptions = {}) {
    return this.request<T>(endpoint, {
      method: "DELETE",
      body: body ? JSON.stringify(body) : undefined,
      ...options,
    });
  }

  // postText sends a POST with a raw string body and a custom Content-Type.
  // Use this for text/csv, text/plain (SQL imports), application/json bulks
  // sent as raw strings, etc.
  postText<T = Record<string, unknown>>(
    endpoint: string,
    body: string,
    contentType: string,
    options: RequestOptions = {}
  ) {
    return this.request<T>(endpoint, {
      method: "POST",
      body,
      headers: { "Content-Type": contentType, ...(options.headers || {}) },
    });
  }

  // upload sends a multipart/form-data POST. Use this for file uploads
  // (imports, restores, GridFS). The browser sets the Content-Type and
  // boundary automatically because we pass FormData as the body.
  upload<T = Record<string, unknown>>(
    endpoint: string,
    form: FormData,
    options: RequestOptions = {}
  ) {
    return this.request<T>(endpoint, {
      method: "POST",
      body: form,
      ...options,
    });
  }

  // download fetches a binary payload as a Blob and triggers a browser
  // file download. Use this for exports, backups, GridFS downloads. The
  // filename can be overridden — if omitted we try the Content-Disposition
  // header, then fall back to the last URL segment.
  async download(
    endpoint: string,
    filename?: string,
    options: RequestOptions & RequestInit = {}
  ): Promise<void> {
    const res = await this.rawFetch(endpoint, { method: "GET", ...options });
    if (!res.ok) {
      const text = await res.text();
      let msg = text;
      try {
        const data = JSON.parse(text) as { error?: string };
        if (data.error) msg = data.error;
      } catch {
        // body wasn't JSON, keep raw text
      }
      throw new Error(msg || `HTTP ${res.status}`);
    }

    let name = filename;
    if (!name) {
      const cd = res.headers.get("Content-Disposition") || "";
      const match = cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
      if (match) name = decodeURIComponent(match[1]);
    }
    if (!name) {
      name = endpoint.split("/").pop() || "download";
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }
}

export const customfetch = new CustomFetch(API_URL);
export { API_URL };
export default customfetch;

const API_URL = "/api";

type RequestOptions = {
  headers?: Record<string, string>;
};

type BodyData = Record<string, unknown>;

let refreshPromise: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
  const refreshToken = localStorage.getItem("refresh_token");
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
      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("refresh_token", data.refresh_token);
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

function getCSRFToken(): string {
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
    const token = localStorage.getItem("access_token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  private getCSRFHeader(method: string): Record<string, string> {
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") return {};
    const token = getCSRFToken();
    return token ? { "X-CSRF-Token": token } : {};
  }

  private buildFetchOptions(
    options: RequestOptions & RequestInit
  ): RequestInit {
    const { headers, ...rest } = options;
    const method = (rest.method || "GET").toUpperCase();
    return {
      headers: {
        "Content-Type": "application/json",
        ...this.getAuthHeader(),
        ...this.getCSRFHeader(method),
        ...(headers || {}),
      },
      ...rest,
    };
  }

  private async request<T = Record<string, unknown>>(
    endpoint: string,
    options: RequestOptions & RequestInit = {}
  ): Promise<T> {
    let res: Response;
    try {
      res = await fetch(
        `${this.baseURL}${endpoint}`,
        this.buildFetchOptions(options)
      );
    } catch {
      // Network error (connection refused, DB stopped, server down)
      if (!endpoint.startsWith("/auth/")) {
        this.handleConnectionLost();
      }
      throw new Error("Connection lost — server unreachable");
    }

    // On 401, try refresh then retry once
    if (res.status === 401 && !endpoint.startsWith("/auth/")) {
      const refreshed = await refreshOnce();
      if (refreshed) {
        res = await fetch(
          `${this.baseURL}${endpoint}`,
          this.buildFetchOptions(options)
        );
      }

      if (res.status === 401) {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        window.location.reload();
        throw new Error("Session expired");
      }
    }

    const text = await res.text();
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(text || `HTTP ${res.status}`);
    }

    if (!res.ok) {
      const errorMsg = (data.error as string) || "An error occurred";

      // If backend says "not connected" or connection failed, disconnect the user
      if (errorMsg === "not connected" || errorMsg.includes("connection refused") || errorMsg.includes("failed to ping")) {
        this.handleConnectionLost();
        throw new Error("Database connection lost");
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
}

export const customfetch = new CustomFetch(API_URL);
export default customfetch;

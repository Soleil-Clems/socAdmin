// @soleil-clems: Lib - Custom fetch with JWT auto-refresh
// Read the secret API prefix injected by the backend into index.html
const API_PREFIX = (window as unknown as Record<string, string>).__SOCADMIN_API_PREFIX__ || "";
const API_URL = API_PREFIX ? `/${API_PREFIX}/api` : "/api";

type RequestOptions = {
  headers?: Record<string, string>;
};

type BodyData = Record<string, unknown> | unknown[];

let refreshPromise: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    return res.ok;
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
    const isFormData =
      typeof FormData !== "undefined" && rest.body instanceof FormData;
    const baseHeaders: Record<string, string> = {
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
      body: body ? JSON.stringify(body) : undefined,
      ...options,
    });
  }

  put<T = Record<string, unknown>>(endpoint: string, body?: BodyData, options: RequestOptions = {}) {
    return this.request<T>(endpoint, {
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
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

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

class CustomFetch {
  baseURL: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  private getAuthHeader(): Record<string, string> {
    const token = localStorage.getItem("access_token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  private buildFetchOptions(
    options: RequestOptions & RequestInit
  ): RequestInit {
    const { headers, ...rest } = options;
    return {
      headers: {
        "Content-Type": "application/json",
        ...this.getAuthHeader(),
        ...(headers || {}),
      },
      ...rest,
    };
  }

  private async request(
    endpoint: string,
    options: RequestOptions & RequestInit = {}
  ) {
    let res = await fetch(
      `${this.baseURL}${endpoint}`,
      this.buildFetchOptions(options)
    );

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
      throw new Error((data.error as string) || "An error occurred");
    }

    return data;
  }

  get(endpoint: string, options: RequestOptions = {}) {
    return this.request(endpoint, { method: "GET", ...options });
  }

  post(endpoint: string, body?: BodyData, options: RequestOptions = {}) {
    return this.request(endpoint, {
      method: "POST",
      body: JSON.stringify(body),
      ...options,
    });
  }

  put(endpoint: string, body?: BodyData, options: RequestOptions = {}) {
    return this.request(endpoint, {
      method: "PUT",
      body: JSON.stringify(body),
      ...options,
    });
  }

  delete(endpoint: string, body?: BodyData, options: RequestOptions = {}) {
    return this.request(endpoint, {
      method: "DELETE",
      body: body ? JSON.stringify(body) : undefined,
      ...options,
    });
  }
}

export const customfetch = new CustomFetch(API_URL);
export default customfetch;

const API_URL = "/api";

type RequestOptions = {
  headers?: Record<string, string>;
};

type BodyData = Record<string, unknown>;

class CustomFetch {
  baseURL: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  private async request(endpoint: string, options: RequestOptions & RequestInit = {}) {
    const { headers, ...rest } = options;

    const res = await fetch(`${this.baseURL}${endpoint}`, {
      headers: {
        "Content-Type": "application/json",
        ...(headers || {}),
      },
      ...rest,
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "An error occurred");
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

  delete(endpoint: string, options: RequestOptions = {}) {
    return this.request(endpoint, { method: "DELETE", ...options });
  }
}

export const customfetch = new CustomFetch(API_URL);
export default customfetch;

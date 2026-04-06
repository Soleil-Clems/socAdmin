import customfetch from "@/lib/custom-fetch";

type LoginPayload = {
  email: string;
  password: string;
};

type RegisterPayload = {
  email: string;
  password: string;
};

type RefreshPayload = {
  refresh_token: string;
};

type AuthTokens = {
  access_token: string;
  refresh_token: string;
};

type MeResponse = {
  role: string;
};

export const authRequest = {
  login: (data: LoginPayload) => customfetch.post<AuthTokens>("/auth/login", data),

  register: (data: RegisterPayload) => customfetch.post<AuthTokens>("/auth/register", data),

  refresh: (data: RefreshPayload) => customfetch.post<AuthTokens>("/auth/refresh", data),

  me: () => customfetch.get<MeResponse>("/auth/me"),
};

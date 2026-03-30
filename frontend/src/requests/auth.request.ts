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

export const authRequest = {
  login: (data: LoginPayload) => customfetch.post("/auth/login", data),

  register: (data: RegisterPayload) => customfetch.post("/auth/register", data),

  refresh: (data: RefreshPayload) => customfetch.post("/auth/refresh", data),

  me: () => customfetch.get("/auth/me"),
};

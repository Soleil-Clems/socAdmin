// @soleil-clems: Request - Auth API calls
import customfetch from "@/lib/custom-fetch";

type LoginPayload = {
  email: string;
  password: string;
};

type RegisterPayload = {
  email: string;
  password: string;
};

type LoginResponse = {
  role: string;
  email: string;
};

type RegisterResponse = {
  id: number;
  email: string;
  role: string;
};

type MeResponse = {
  role: string;
  email: string;
};

export const authRequest = {
  setupStatus: () => customfetch.get<{ needsSetup: boolean }>("/auth/setup-status"),

  login: (data: LoginPayload) => customfetch.post<LoginResponse>("/auth/login", data),

  register: (data: RegisterPayload) => customfetch.post<RegisterResponse>("/auth/register", data),

  me: () => customfetch.get<MeResponse>("/auth/me"),

  logout: () => customfetch.post("/auth/logout"),

  changePassword: (currentPassword: string, newPassword: string) =>
    customfetch.post<{ status: string }>("/auth/password", {
      current_password: currentPassword,
      new_password: newPassword,
    }),
};

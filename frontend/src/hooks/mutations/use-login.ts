import { useMutation } from "@tanstack/react-query";
import { authRequest } from "@/requests/auth.request";
import type { LoginFormData } from "@/schemas/auth.schema";

export function useLogin() {
  return useMutation({
    mutationFn: (data: LoginFormData) => authRequest.login(data),
  });
}

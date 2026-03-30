import { useMutation } from "@tanstack/react-query";
import { authRequest } from "@/requests/auth.request";

type RegisterPayload = {
  email: string;
  password: string;
};

export function useRegister() {
  return useMutation({
    mutationFn: (data: RegisterPayload) => authRequest.register(data),
  });
}

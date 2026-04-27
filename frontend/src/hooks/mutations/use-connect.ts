import { useMutation } from "@tanstack/react-query";
import { connectionRequest } from "@/requests/connection.request";
import type { ConnectFormData } from "@/schemas/connect.schema";

export function useConnect() {
  return useMutation({
    mutationFn: (data: ConnectFormData) => connectionRequest.connect(data),
  });
}

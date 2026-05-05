import { useMutation, useQueryClient } from "@tanstack/react-query";
import { appUsersRequest } from "@/requests/app-users.request";

export function useUpdateUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: number; role: "admin" | "readonly" }) =>
      appUsersRequest.updateRole(id, role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["app-users"] });
    },
  });
}

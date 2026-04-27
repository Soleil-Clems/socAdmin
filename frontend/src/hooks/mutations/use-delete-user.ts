import { useMutation, useQueryClient } from "@tanstack/react-query";
import { appUsersRequest } from "@/requests/app-users.request";

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => appUsersRequest.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["app-users"] });
    },
  });
}

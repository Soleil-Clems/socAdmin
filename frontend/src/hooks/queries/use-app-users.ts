import { useQuery } from "@tanstack/react-query";
import { appUsersRequest } from "@/requests/app-users.request";

export function useAppUsers(enabled = true) {
  return useQuery({
    queryKey: ["app-users"],
    queryFn: () => appUsersRequest.list(),
    enabled,
  });
}

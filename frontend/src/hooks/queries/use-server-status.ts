import { useQuery } from "@tanstack/react-query";
import { databaseRequest } from "@/requests/database.request";

export function useServerStatus() {
  return useQuery({
    queryKey: ["server-status"],
    queryFn: () => databaseRequest.serverStatus(),
    refetchInterval: 30000, // refresh every 30s
  });
}

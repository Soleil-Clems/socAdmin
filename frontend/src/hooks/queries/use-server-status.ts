import { useQuery } from "@tanstack/react-query";
import { databaseRequest } from "@/requests/database.request";
import { useConnectionStore } from "@/stores/connection.store";

export function useServerStatus() {
  const isConnected = useConnectionStore((s) => s.isConnected);
  return useQuery({
    queryKey: ["server-status"],
    queryFn: () => databaseRequest.serverStatus(),
    enabled: isConnected,
    refetchInterval: 30000,
    retry: 1,
  });
}

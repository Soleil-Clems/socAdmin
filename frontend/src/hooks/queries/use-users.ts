import { useQuery } from "@tanstack/react-query";
import { databaseRequest } from "@/requests/database.request";
import { useConnectionStore } from "@/stores/connection.store";

export function useUsers() {
  const isConnected = useConnectionStore((s) => s.isConnected);
  return useQuery({
    queryKey: ["users"],
    queryFn: () => databaseRequest.listUsers(),
    enabled: isConnected,
    retry: 1,
  });
}

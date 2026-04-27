import { useQuery } from "@tanstack/react-query";
import { databaseRequest } from "@/requests/database.request";

export function useDatabases() {
  return useQuery({
    queryKey: ["databases"],
    queryFn: () => databaseRequest.list(),
  });
}

import { useQuery } from "@tanstack/react-query";
import { databaseRequest } from "@/requests/database.request";

export function useTables(db: string) {
  return useQuery({
    queryKey: ["tables", db],
    queryFn: () => databaseRequest.listTables(db),
    enabled: !!db,
  });
}

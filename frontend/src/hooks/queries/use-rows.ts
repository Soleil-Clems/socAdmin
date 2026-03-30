import { useQuery } from "@tanstack/react-query";
import { databaseRequest } from "@/requests/database.request";

export function useRows(db: string, table: string, limit = 50, offset = 0) {
  return useQuery({
    queryKey: ["rows", db, table, limit, offset],
    queryFn: () => databaseRequest.getRows(db, table, limit, offset),
    enabled: !!db && !!table,
  });
}

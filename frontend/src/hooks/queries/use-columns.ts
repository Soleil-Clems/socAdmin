import { useQuery } from "@tanstack/react-query";
import { databaseRequest } from "@/requests/database.request";

export function useColumns(db: string, table: string) {
  return useQuery({
    queryKey: ["columns", db, table],
    queryFn: () => databaseRequest.describeTable(db, table),
    enabled: !!db && !!table,
  });
}

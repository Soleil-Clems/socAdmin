import { useMutation } from "@tanstack/react-query";
import { databaseRequest } from "@/requests/database.request";

export function useExecuteQuery() {
  return useMutation({
    mutationFn: (query: string) => databaseRequest.executeQuery(query),
  });
}

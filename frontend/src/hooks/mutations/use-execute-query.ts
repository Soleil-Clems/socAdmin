import { useMutation } from "@tanstack/react-query";
import { databaseRequest } from "@/requests/database.request";

type ExecuteQueryParams = {
  query: string;
  database?: string;
};

export function useExecuteQuery() {
  return useMutation({
    mutationFn: ({ query, database }: ExecuteQueryParams) =>
      databaseRequest.executeQuery(query, database),
  });
}

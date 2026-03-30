import { useMutation, useQueryClient } from "@tanstack/react-query";
import { databaseRequest } from "@/requests/database.request";

type InsertRowParams = {
  db: string;
  table: string;
  data: Record<string, unknown>;
};

export function useInsertRow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ db, table, data }: InsertRowParams) =>
      databaseRequest.insertRow(db, table, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rows"] });
    },
  });
}

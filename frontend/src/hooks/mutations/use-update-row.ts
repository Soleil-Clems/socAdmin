import { useMutation, useQueryClient } from "@tanstack/react-query";
import { databaseRequest } from "@/requests/database.request";

type UpdateRowParams = {
  db: string;
  table: string;
  primaryKey: Record<string, unknown>;
  data: Record<string, unknown>;
};

export function useUpdateRow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ db, table, primaryKey, data }: UpdateRowParams) =>
      databaseRequest.updateRow(db, table, primaryKey, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rows"] });
    },
  });
}

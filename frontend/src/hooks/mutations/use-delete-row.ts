import { useMutation, useQueryClient } from "@tanstack/react-query";
import { databaseRequest } from "@/requests/database.request";

type DeleteRowParams = {
  db: string;
  table: string;
  primaryKey: Record<string, unknown>;
};

export function useDeleteRow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ db, table, primaryKey }: DeleteRowParams) =>
      databaseRequest.deleteRow(db, table, primaryKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rows"] });
    },
  });
}

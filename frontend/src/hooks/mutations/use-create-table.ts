import { useMutation, useQueryClient } from "@tanstack/react-query";
import { databaseRequest, type TableColumnDef } from "@/requests/database.request";

type CreateTableParams = {
  db: string;
  name: string;
  columns: TableColumnDef[];
};

export function useCreateTable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ db, name, columns }: CreateTableParams) =>
      databaseRequest.createTable(db, name, columns),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tables"] });
    },
  });
}

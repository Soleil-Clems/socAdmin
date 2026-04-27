import { useMutation, useQueryClient } from "@tanstack/react-query";
import { databaseRequest } from "@/requests/database.request";

type TruncateTableParams = {
  db: string;
  table: string;
};

export function useTruncateTable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ db, table }: TruncateTableParams) =>
      databaseRequest.truncateTable(db, table),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rows"] });
    },
  });
}

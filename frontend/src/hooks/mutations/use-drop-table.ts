import { useMutation, useQueryClient } from "@tanstack/react-query";
import { databaseRequest } from "@/requests/database.request";

type DropTableParams = {
  db: string;
  table: string;
};

export function useDropTable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ db, table }: DropTableParams) =>
      databaseRequest.dropTable(db, table),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tables"] });
    },
  });
}

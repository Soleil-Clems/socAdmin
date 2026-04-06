import { useMutation, useQueryClient } from "@tanstack/react-query";
import { databaseRequest, type AlterColumnOp } from "@/requests/database.request";

type Params = {
  db: string;
  table: string;
  op: AlterColumnOp;
};

export function useAlterColumn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ db, table, op }: Params) =>
      databaseRequest.alterColumn(db, table, op),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["columns", vars.db, vars.table] });
      qc.invalidateQueries({ queryKey: ["rows", vars.db, vars.table] });
    },
  });
}

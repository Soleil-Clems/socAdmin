import { useMutation, useQueryClient } from "@tanstack/react-query";
import { databaseRequest } from "@/requests/database.request";

export function useDropDatabase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (db: string) => databaseRequest.dropDatabase(db),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["databases"] });
    },
  });
}

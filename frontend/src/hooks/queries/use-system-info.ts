import { useQuery } from "@tanstack/react-query";
import { systemRequest } from "@/requests/system.request";

export function useSystemInfo() {
  return useQuery({
    queryKey: ["system-info"],
    queryFn: () => systemRequest.info(),
  });
}

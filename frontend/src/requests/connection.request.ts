import customfetch from "@/lib/custom-fetch";
import type { ConnectFormData } from "@/schemas/connect.schema";

export const connectionRequest = {
  connect: (data: ConnectFormData) => customfetch.post("/connect", data),
};

import customfetch from "@/lib/custom-fetch";
import type { ConnectFormData } from "@/schemas/connect.schema";

export type SavedConnection = {
  id: number;
  name: string;
  type: string;
  host: string;
  port: number;
  user: string;
};

export const connectionRequest = {
  connect: (data: ConnectFormData) => customfetch.post("/connect", data),

  // Saved connections (AES-256 encrypted at rest)
  listSaved: () =>
    customfetch.get("/connections") as unknown as Promise<SavedConnection[]>,

  save: (data: {
    name: string;
    type: string;
    host: string;
    port: number;
    user: string;
    password: string;
  }) => customfetch.post("/connections", data),

  useSaved: (id: number) =>
    customfetch.post(`/connections/${id}/use`),

  deleteSaved: (id: number) =>
    customfetch.delete(`/connections/${id}`),
};

import customfetch from "@/lib/custom-fetch";

export type AppUser = {
  id: number;
  email: string;
  role: "admin" | "readonly";
  created_at: string;
};

export const appUsersRequest = {
  list: () => customfetch.get("/users/app") as unknown as Promise<AppUser[]>,

  updateRole: (id: number, role: "admin" | "readonly") =>
    customfetch.put(`/users/app/${id}/role`, { role }),

  delete: (id: number) => customfetch.delete(`/users/app/${id}`),
};

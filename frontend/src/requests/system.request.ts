import customfetch from "@/lib/custom-fetch";

type SystemInfo = {
  installed_sgbd: string[];
};

export const systemRequest = {
  info: () => customfetch.get<SystemInfo>("/system/info"),
};

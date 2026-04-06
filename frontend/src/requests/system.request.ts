import customfetch from "@/lib/custom-fetch";

type SystemInfo = {
  os_user: string;
  os: string;
  arch: string;
  installed_sgbd: string[];
};

export const systemRequest = {
  info: () => customfetch.get<SystemInfo>("/system/info"),
};

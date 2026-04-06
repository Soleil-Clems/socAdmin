import customfetch from "@/lib/custom-fetch";

type SystemInfo = {
  os_user: string;
  os: string;
  arch: string;
};

export const systemRequest = {
  info: () => customfetch.get<SystemInfo>("/system/info"),
};

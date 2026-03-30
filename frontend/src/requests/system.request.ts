import customfetch from "@/lib/custom-fetch";

export const systemRequest = {
  info: () => customfetch.get("/system/info"),
};

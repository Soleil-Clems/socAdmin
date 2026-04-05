import customfetch from "@/lib/custom-fetch";

export type WhitelistResponse = {
  enabled: boolean;
  ips: string[];
  client_ip: string;
};

export const securityRequest = {
  getWhitelist: () =>
    customfetch.get("/security/whitelist") as Promise<WhitelistResponse>,

  toggleWhitelist: (enabled: boolean) =>
    customfetch.put("/security/whitelist", { enabled }),

  addIP: (ip: string) =>
    customfetch.post("/security/whitelist/ip", { ip }),

  removeIP: (ip: string) =>
    customfetch.delete("/security/whitelist/ip", { ip }),
};

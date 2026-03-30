import { z } from "zod";

export const dbTypes = ["mysql", "postgresql", "mongodb"] as const;

export const connectSchema = z.object({
  host: z.string().min(1, "Host is required"),
  port: z.number().min(1).max(65535),
  user: z.string(),
  password: z.string(),
  type: z.enum(dbTypes),
});

export type ConnectFormData = z.infer<typeof connectSchema>;

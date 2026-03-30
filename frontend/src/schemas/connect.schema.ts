import { z } from "zod";

export const connectSchema = z.object({
  host: z.string().min(1, "Host is required"),
  port: z.number().min(1).max(65535),
  user: z.string().min(1, "User is required"),
  password: z.string(),
});

export type ConnectFormData = z.infer<typeof connectSchema>;

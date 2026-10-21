import "server-only";
import { z } from "zod";

const serverSchema = z.object({
  DATABASE_URL: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  /** Sal para anonimizar IPs na auditoria. Gerado a partir da service key se ausente. */
  AUDIT_IP_SALT: z.string().optional(),
});

export const serverEnv = serverSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  AUDIT_IP_SALT: process.env.AUDIT_IP_SALT,
});

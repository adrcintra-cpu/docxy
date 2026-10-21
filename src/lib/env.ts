import { z } from "zod";

/**
 * Variáveis públicas (seguras para o navegador). As secretas ficam em
 * src/lib/env.server.ts e nunca são importadas por componentes cliente.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_AUTH_PROVIDERS: z.string().optional().default(""),
});

export const publicEnv = publicSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_AUTH_PROVIDERS: process.env.NEXT_PUBLIC_AUTH_PROVIDERS,
});

export const OAUTH_PROVIDERS = ["azure", "google", "apple"] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

/** Provedores sociais ativados (Microsoft = "azure" no Supabase). */
export const enabledProviders: OAuthProvider[] = publicEnv.NEXT_PUBLIC_AUTH_PROVIDERS.split(",")
  .map((p) => p.trim().toLowerCase())
  .filter((p): p is OAuthProvider => (OAUTH_PROVIDERS as readonly string[]).includes(p));

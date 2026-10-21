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

/** No build sem variáveis (primeiro deploy), usa valores neutros; em execução a validação é estrita. */
const building = process.env.NEXT_PHASE === "phase-production-build";
const raw = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  // Na Vercel, sem NEXT_PUBLIC_SITE_URL, usa o domínio de produção do projeto.
  NEXT_PUBLIC_SITE_URL:
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL}` : undefined),
  NEXT_PUBLIC_AUTH_PROVIDERS: process.env.NEXT_PUBLIC_AUTH_PROVIDERS,
};
const parsed = publicSchema.safeParse(raw);
if (!parsed.success && !building) console.error("[env] variáveis públicas ausentes ou inválidas:", parsed.error.issues.map((i) => i.path.join(".")).join(", "));
/** Sem configuração, usa valores neutros para não derrubar o servidor; o middleware mostra a página de configuração. */
export const publicEnv = parsed.success
  ? parsed.data
  : publicSchema.parse({ ...raw, NEXT_PUBLIC_SUPABASE_URL: "https://config.invalid", NEXT_PUBLIC_SUPABASE_ANON_KEY: "missing", NEXT_PUBLIC_SITE_URL: undefined });

export const OAUTH_PROVIDERS = ["azure", "google", "apple"] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

/** Provedores sociais ativados (Microsoft = "azure" no Supabase). */
export const enabledProviders: OAuthProvider[] = publicEnv.NEXT_PUBLIC_AUTH_PROVIDERS.split(",")
  .map((p) => p.trim().toLowerCase())
  .filter((p): p is OAuthProvider => (OAUTH_PROVIDERS as readonly string[]).includes(p));

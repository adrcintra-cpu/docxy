import type { CookieOptions } from "@supabase/ssr";

/** Cookie da opção "Manter conectado". "0" = sessão só até fechar o navegador. */
export const REMEMBER_COOKIE = "docxy_remember";

/** Remove a persistência para virar cookie de sessão do navegador. */
export function applyRemember(options: CookieOptions | undefined, remember: boolean): CookieOptions {
  const base: CookieOptions = { ...options, httpOnly: options?.httpOnly ?? true, sameSite: "lax", secure: process.env.NODE_ENV === "production" };
  if (remember) return base;
  delete base.maxAge;
  delete base.expires;
  return base;
}

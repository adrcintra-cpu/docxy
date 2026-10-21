import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import { REMEMBER_COOKIE, applyRemember } from "./cookies";

/** Cliente Supabase com a sessão do usuário (Server Components, Actions, Route Handlers). */
export async function createClient() {
  const cookieStore = await cookies();
  const remember = cookieStore.get(REMEMBER_COOKIE)?.value !== "0";

  return createServerClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, applyRemember(options, remember));
          }
        } catch {
          // Chamado de um Server Component: o middleware renova os cookies.
        }
      },
    },
  });
}

/**
 * Cliente com a service role — ignora RLS. Somente no servidor, para
 * Storage (URLs assinadas) e convites. Nunca repasse o resultado ao cliente sem checar permissão.
 */
export function createServiceClient() {
  return createAdminClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, serverEnv.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

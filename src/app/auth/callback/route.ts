import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";

/**
 * Retorno do OAuth e dos links de e-mail (recuperação de senha, convite):
 * troca o `code` PKCE por uma sessão e segue para `next`.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next") ?? "/";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";
  const method = searchParams.get("method") ?? "email_link";

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=link", origin));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    await audit({ event: "auth.callback", result: "FAILURE", metadata: { method, reason: error?.code ?? "unknown" } });
    return NextResponse.redirect(new URL("/login?error=link", origin));
  }

  await db.user.updateMany({ where: { id: data.user.id }, data: { lastSeenAt: new Date() } });
  await audit({ event: "auth.sign_in", result: "SUCCESS", userId: data.user.id, metadata: { method } });
  return NextResponse.redirect(new URL(next, origin));
}

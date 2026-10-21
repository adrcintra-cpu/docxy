import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";

/**
 * Links de e-mail no formato token_hash (modelo recomendado nos templates do
 * Supabase): {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/redefinir-senha
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const rawNext = searchParams.get("next") ?? "/";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  if (!tokenHash || !type) return NextResponse.redirect(new URL("/login?error=link", origin));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  await audit({
    event: `auth.confirm.${type}`,
    result: error ? "FAILURE" : "SUCCESS",
    userId: data.user?.id,
    metadata: { reason: error?.code },
  });

  if (error) return NextResponse.redirect(new URL("/login?error=link", origin));
  return NextResponse.redirect(new URL(next, origin));
}

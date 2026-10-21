import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { missingEnv, setupPage } from "@/lib/setup";

export async function middleware(request: NextRequest) {
  const missing = missingEnv();
  if (missing.length) return new NextResponse(setupPage(missing), { status: 503, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  return updateSession(request);
}

export const config = {
  matcher: [
    // Tudo, exceto arquivos estáticos e imagens.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

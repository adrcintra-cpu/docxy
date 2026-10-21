import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { enabledProviders } from "@/lib/env";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  return (
    <AuthShell>
      <h1 className="sr-only">Entrar no Docxy</h1>
      <LoginForm providers={enabledProviders} next={next} linkError={error} />
    </AuthShell>
  );
}

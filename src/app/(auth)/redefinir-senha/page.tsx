import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { NewPasswordForm } from "@/components/auth/reset-forms";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Nova senha" };

/** Aberta pelo link de recuperação (o callback já criou a sessão temporária). */
export default async function ResetPasswordPage() {
  await requireUser();
  return (
    <AuthShell>
      <NewPasswordForm />
    </AuthShell>
  );
}

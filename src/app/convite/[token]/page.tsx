import type { Metadata } from "next";
import Link from "next/link";
import { createHash } from "node:crypto";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Logo } from "@/components/brand/logo";
import { ROLE_LABEL } from "@/lib/auth/permissions";
import { AcceptInviteButton } from "./accept-button";

export const metadata: Metadata = { title: "Convite" };

/** Página do link de convite. Exige login; o aceite confere que o e-mail da conta é o convidado. */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await requireUser();
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const invite = await db.invitation.findUnique({
    where: { tokenHash },
    include: { organization: { select: { name: true } }, workspace: { select: { name: true } }, invitedBy: { select: { name: true, email: true } } },
  });

  const problem = !invite
    ? "Este convite não existe."
    : invite.status !== "PENDING"
      ? invite.status === "ACCEPTED"
        ? "Este convite já foi aceito."
        : "Este convite foi cancelado."
      : invite.expiresAt < new Date()
        ? "Este convite expirou. Peça um novo a quem convidou você."
        : invite.email.toLowerCase() !== user.email.toLowerCase()
          ? `Este convite foi enviado para ${invite.email}. Entre com essa conta para aceitá-lo.`
          : null;

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-md rounded-lg bg-surface p-10 text-center shadow-panel">
        <Logo className="mx-auto mb-8 h-10" />
        {problem || !invite ? (
          <>
            <h1 className="text-title font-semibold">Não foi possível usar o convite</h1>
            <p className="mt-3 text-body-sm text-ink-muted">{problem}</p>
            <Link href="/" className="mt-8 inline-block text-body text-accent-strong hover:underline">
              Ir para o início
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-title font-semibold">Convite para {invite.workspace?.name ?? invite.organization.name}</h1>
            <p className="mt-3 text-body-sm text-ink-muted">
              {invite.invitedBy.name ?? invite.invitedBy.email} convidou você para{" "}
              {invite.workspace ? `o workspace ${invite.workspace.name} em ${invite.organization.name}` : invite.organization.name}, com perfil{" "}
              <strong className="text-ink">{ROLE_LABEL[invite.role]}</strong>.
            </p>
            <AcceptInviteButton token={token} />
          </>
        )}
      </div>
    </main>
  );
}

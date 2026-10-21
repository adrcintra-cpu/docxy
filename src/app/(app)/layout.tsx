import { requireUser, getActiveMembership } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { AppHeader } from "@/components/layout/app-header";
import { NavDrawer } from "@/components/layout/nav-drawer";
import { Logo } from "@/components/brand/logo";
import { signOut } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/toast";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const membership = await getActiveMembership(user.id);

  if (!membership) return <NoOrganization email={user.email} />;

  const [notifications, unreadCount] = await Promise.all([
    db.notification.findMany({
      where: { userId: user.id, organizationId: membership.organizationId },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, title: true, body: true, href: true, readAt: true, createdAt: true },
    }),
    db.notification.count({ where: { userId: user.id, organizationId: membership.organizationId, readAt: null } }),
  ]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-[1920px] flex-col gap-4 p-3 sm:gap-6 sm:p-6">
      <NavDrawer role={membership.role} />
      <AppHeader
        organizationName={membership.organization.name}
        userName={user.name ?? user.email}
        userEmail={user.email}
        role={membership.role}
        notifications={notifications}
        unreadCount={unreadCount}
      />
      {children}
      <Toaster />
    </div>
  );
}

/** Usuário autenticado sem organização: precisa de convite (isolamento entre organizações). */
function NoOrganization({ email }: { email: string }) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-md rounded-lg bg-surface p-10 text-center shadow-panel">
        <Logo className="mx-auto mb-8 h-10" />
        <h1 className="text-title font-semibold">Você ainda não faz parte de uma organização</h1>
        <p className="mt-3 text-body-sm text-ink-muted">
          A conta <strong className="text-ink">{email}</strong> está ativa, mas o acesso aos documentos depende de um
          convite de um administrador da sua organização.
        </p>
        <form action={signOut} className="mt-8">
          <Button type="submit" variant="primary">Sair</Button>
        </form>
      </div>
    </main>
  );
}

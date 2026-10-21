import Link from "next/link";
import { Bell, LogOut, Menu, User as UserIcon } from "lucide-react";
import type { Notification, Role } from "@prisma/client";
import { Logo } from "@/components/brand/logo";
import { signOut } from "@/app/auth/actions";
import { markAllNotificationsRead } from "@/app/actions/notifications";
import { ROLE_LABEL } from "@/lib/auth/permissions";
import { formatDate } from "@/lib/utils";

/** Cabeçalho (referências 02–11): menu, organização, logo, perfil e notificações. */
export function AppHeader({
  organizationName,
  userName,
  userEmail,
  role,
  notifications,
  unreadCount,
}: {
  organizationName: string;
  userName: string;
  userEmail: string;
  role: Role;
  notifications: Pick<Notification, "id" | "title" | "body" | "href" | "readAt" | "createdAt">[];
  unreadCount: number;
}) {
  return (
    <header className="flex h-16 items-center gap-4 rounded-lg border border-[#3b4459] bg-[linear-gradient(180deg,rgba(74,86,110,.5)_0%,rgba(40,48,66,.5)_100%)] px-4 shadow-[0_8px_20px_-6px_rgba(0,0,0,.35)] backdrop-blur-md sm:h-20 sm:px-8">
      <label htmlFor="nav-toggle" className="cursor-pointer rounded-full p-2 text-ink-muted hover:text-ink" aria-label="Abrir menu">
        <Menu className="size-[22px]" strokeWidth={1.5} />
      </label>
      <div className="ml-auto flex items-center gap-3 sm:gap-6">
        <Logo className="hidden h-6 sm:block" />

        <details className="group relative">
          <summary className="flex size-10 cursor-pointer list-none items-center justify-center rounded-full bg-page text-ink hover:ring-2 hover:ring-line" aria-label="Perfil">
            <UserIcon className="size-5" strokeWidth={1.5} />
          </summary>
          <div className="absolute right-0 z-30 mt-4 w-72 rounded-md border border-line bg-overlay p-4 shadow-panel">
            <p className="truncate text-body font-semibold">{userName}</p>
            <p className="truncate text-body-sm text-ink-muted">{userEmail}</p>
            <p className="mt-2 text-label text-ink-muted">{ROLE_LABEL[role]} · {organizationName}</p>
            <form action={signOut} className="mt-4 border-t border-line pt-3">
              <button type="submit" className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-body text-ink hover:bg-surface">
                <LogOut className="size-4" /> Sair
              </button>
            </form>
          </div>
        </details>

        <details className="relative">
          <summary className="relative flex size-10 cursor-pointer list-none items-center justify-center rounded-full text-ink hover:bg-surface" aria-label={`Notificações${unreadCount ? ` (${unreadCount} não lidas)` : ""}`}>
            <Bell className="size-[22px]" strokeWidth={1.5} />
            {unreadCount > 0 && <span className="absolute right-2 top-1.5 size-2.5 rounded-full bg-alert" />}
          </summary>
          <div className="absolute right-0 z-30 mt-4 w-80 rounded-md border border-line bg-overlay p-2 shadow-panel">
            <div className="flex items-center justify-between px-2 py-2">
              <p className="text-label text-ink-muted">Notificações</p>
              {unreadCount > 0 && (
                <form action={markAllNotificationsRead}>
                  <button type="submit" className="text-label text-accent-strong hover:underline">
                    Marcar como lidas
                  </button>
                </form>
              )}
            </div>
            {notifications.length === 0 ? (
              <p className="px-2 py-6 text-center text-body-sm text-ink-muted">Nenhuma notificação por enquanto.</p>
            ) : (
              <ul>
                {notifications.map((n) => (
                  <li key={n.id}>
                    <Link href={n.href ?? "#"} className="block rounded-sm px-2 py-2 hover:bg-surface">
                      <p className={n.readAt ? "text-body-sm text-ink-muted" : "text-body-sm font-semibold"}>{n.title}</p>
                      {n.body && <p className="line-clamp-2 text-label text-ink-muted">{n.body}</p>}
                      <p className="mt-1 text-label text-ink-subtle">{formatDate(n.createdAt)}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </details>
      </div>
    </header>
  );
}

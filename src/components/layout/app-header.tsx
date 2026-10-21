import Link from "next/link";
import { Bell, LogOut, Menu, MicOff, User as UserIcon } from "lucide-react";
import type { Notification, Role } from "@prisma/client";
import { Logo } from "@/components/brand/logo";
import { signOut } from "@/app/auth/actions";
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
    <header className="flex h-16 items-center gap-4 rounded-lg border border-white/5 bg-raised px-4 shadow-panel sm:h-20 sm:px-8">
      <label htmlFor="nav-toggle" className="cursor-pointer rounded-full p-2 text-ink-muted hover:text-ink" aria-label="Abrir menu">
        <Menu className="size-7" strokeWidth={1.5} />
      </label>
      <div className="ml-auto flex items-center gap-3 sm:gap-6">
        {/* Assistente de voz: ainda não disponível (estado identificado). */}
        <span title="Assistente de voz — disponível em fase futura" aria-label="Assistente de voz indisponível" className="hidden text-ink-subtle sm:inline-flex">
          <MicOff className="size-6" strokeWidth={1.5} />
        </span>
        <Logo className="hidden h-8 sm:block" />

        <details className="group relative">
          <summary className="flex size-12 cursor-pointer list-none items-center justify-center rounded-full bg-page text-ink hover:ring-2 hover:ring-line" aria-label="Perfil">
            <UserIcon className="size-6" strokeWidth={1.5} />
          </summary>
          <div className="absolute right-0 z-30 mt-3 w-72 rounded-md border border-line bg-overlay p-4 shadow-panel">
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
          <summary className="relative flex size-12 cursor-pointer list-none items-center justify-center rounded-full text-ink hover:bg-surface" aria-label={`Notificações${unreadCount ? ` (${unreadCount} não lidas)` : ""}`}>
            <Bell className="size-7" strokeWidth={1.5} />
            {unreadCount > 0 && <span className="absolute right-2.5 top-2.5 size-3 rounded-full bg-alert ring-2 ring-raised" />}
          </summary>
          <div className="absolute right-0 z-30 mt-3 w-80 rounded-md border border-line bg-overlay p-2 shadow-panel">
            <p className="px-2 py-2 text-label text-ink-muted">Notificações</p>
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

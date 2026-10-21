import Link from "next/link";
import { FolderKanban, LayoutGrid, ShieldCheck, Users, X } from "lucide-react";
import { can } from "@/lib/auth/permissions";
import type { Role } from "@prisma/client";

const NAV = [
  { href: "/", label: "Documentos", icon: LayoutGrid, show: () => true },
  { href: "/workspaces", label: "Workspaces", icon: Users, show: (r: Role) => can(r, "workspace.manage") || can(r, "document.read"), phase: "Fase 2" },
  { href: "/comparacoes", label: "Comparações", icon: FolderKanban, show: () => true, phase: "Fase 3" },
  { href: "/auditoria", label: "Auditoria", icon: ShieldCheck, show: (r: Role) => can(r, "org.audit.read"), phase: "Fase 5" },
];

/**
 * Menu ☰ sem JavaScript: o checkbox #nav-toggle (acionado pelo cabeçalho) abre a gaveta.
 * Itens de fases futuras aparecem marcados como indisponíveis, nunca como links quebrados.
 */
export function NavDrawer({ role }: { role: Role }) {
  return (
    <>
      <input id="nav-toggle" type="checkbox" className="peer sr-only" aria-hidden />
      <label htmlFor="nav-toggle" className="fixed inset-0 z-40 hidden bg-black/50 peer-checked:block" aria-hidden />
      <nav
        aria-label="Navegação principal"
        className="fixed inset-y-0 left-0 z-50 w-72 -translate-x-full bg-overlay p-6 shadow-panel transition-transform duration-300 ease-out-soft peer-checked:translate-x-0"
      >
        <div className="mb-8 flex items-center justify-between">
          <span className="text-label text-ink-muted">Menu</span>
          <label htmlFor="nav-toggle" className="cursor-pointer rounded-full p-1 text-ink-muted hover:text-ink" aria-label="Fechar menu">
            <X className="size-5" />
          </label>
        </div>
        <ul className="flex flex-col gap-1">
          {NAV.filter((n) => n.show(role)).map(({ href, label, icon: Icon, phase }) =>
            phase ? (
              <li key={href} className="flex items-center gap-3 rounded-sm px-3 py-3 text-body text-ink-subtle" aria-disabled>
                <Icon className="size-5" strokeWidth={1.5} />
                {label}
                <span className="ml-auto rounded-full bg-surface px-2 py-0.5 text-label text-ink-muted">{phase}</span>
              </li>
            ) : (
              <li key={href}>
                <Link href={href} className="flex items-center gap-3 rounded-sm px-3 py-3 text-body hover:bg-surface">
                  <Icon className="size-5" strokeWidth={1.5} />
                  {label}
                </Link>
              </li>
            ),
          )}
        </ul>
      </nav>
    </>
  );
}

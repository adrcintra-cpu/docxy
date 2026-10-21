"use client";

import Link from "next/link";
import { FileUp, History, Save, Share2, SquareArrowOutUpRight, Trash2, Users, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Role } from "@prisma/client";
import { can, type Action } from "@/lib/auth/permissions";

interface MenuItem {
  label: string;
  icon: LucideIcon;
  /** Permissão necessária; sem ela o item nem aparece. */
  action: Action;
  /** Fase em que a função chega. Enquanto houver fase, o item aparece como indisponível. */
  phase?: string;
  href?: string;
}

const ITEMS: MenuItem[] = [
  { label: "Abrir", icon: FileUp, action: "document.read", href: "/" },
  { label: "Salvar", icon: Save, action: "document.upload", phase: "Fase 3" },
  { label: "Extrator", icon: SquareArrowOutUpRight, action: "extraction.run", phase: "Fase 4" },
  { label: "Compartilhar", icon: Share2, action: "document.read", href: "/compartilhados" },
  { label: "Histórico", icon: History, action: "document.read", phase: "Fase 5" },
  { label: "Workspace", icon: Users, action: "document.read", href: "/workspaces" },
  { label: "Lixeira", icon: Trash2, action: "document.read", href: "/lixeira" },
];

/**
 * Menu ☰ (referência de menu com overlay): painel flutuante ancorado abaixo do botão,
 * com o resto da tela escurecido. O checkbox #nav-toggle (acionado pelo cabeçalho)
 * abre e fecha; clicar no overlay ou num item também fecha.
 * Funções de fases futuras aparecem marcadas como indisponíveis, nunca como links quebrados.
 */
function closeMenu() {
  const toggle = document.getElementById("nav-toggle") as HTMLInputElement | null;
  if (toggle) toggle.checked = false;
}

export function NavDrawer({ role }: { role: Role }) {
  const items = ITEMS.filter((item) => can(role, item.action));
  return (
    <>
      <input id="nav-toggle" type="checkbox" className="peer sr-only" aria-hidden />
      <label
        htmlFor="nav-toggle"
        aria-hidden
        className="pointer-events-none fixed inset-0 z-40 bg-black/55 opacity-0 backdrop-blur-[2px] transition-opacity duration-200 peer-checked:pointer-events-auto peer-checked:opacity-100"
      />
      <nav
        aria-label="Menu"
        className="pointer-events-none fixed left-3 top-[calc(env(safe-area-inset-top,0px)+64px)] z-50 w-[min(300px,calc(100vw-24px))] origin-top-left -translate-y-2 scale-[0.98] rounded-lg border border-line/70 bg-page p-6 opacity-0 shadow-[0_24px_60px_-16px_rgba(0,0,0,.65)] transition duration-200 ease-out-soft peer-checked:pointer-events-auto peer-checked:translate-y-0 peer-checked:scale-100 peer-checked:opacity-100 sm:left-8 sm:top-[calc(env(safe-area-inset-top,0px)+84px)]"
      >
        <div className="mb-6 flex items-center justify-between">
          <span className="text-body font-semibold">Menu</span>
          <label
            htmlFor="nav-toggle"
            className="-mr-1 cursor-pointer rounded-full p-1 text-ink-muted transition-colors hover:text-ink"
            aria-label="Fechar menu"
          >
            <X className="size-7" strokeWidth={1.5} />
          </label>
        </div>
        <ul className="flex flex-col gap-2">
          {items.map(({ label, icon: Icon, phase, href }) =>
            href && !phase ? (
              <li key={label}>
                <Link
                  href={href}
                  onClick={closeMenu}
                  className="flex items-center gap-4 rounded-sm px-1 py-2.5 text-title text-[#c9ceda] transition-colors hover:text-ink [&:hover_svg]:text-brand"
                >
                  <Icon className="size-7 shrink-0 text-ink-muted transition-colors" strokeWidth={1.4} />
                  {label}
                </Link>
              </li>
            ) : (
              <li
                key={label}
                aria-disabled
                title={`${label} — disponível na ${phase}`}
                className="flex items-center gap-4 rounded-sm px-1 py-2.5 text-title text-[#c9ceda]"
              >
                <Icon className="size-7 shrink-0 text-ink-muted" strokeWidth={1.4} />
                <span className="opacity-70">{label}</span>
                <span className="ml-auto rounded-full bg-surface px-2 py-0.5 text-label text-ink-muted">{phase}</span>
              </li>
            ),
          )}
        </ul>
      </nav>
    </>
  );
}

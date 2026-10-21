"use client";

import { ArrowDownUp, ArrowLeftRight, BarChart3, Braces, Columns2, ExternalLink, FileDown, HelpCircle, PieChart, SquareCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToolId = "review" | "code" | "extract" | "assistant" | "compare" | "metrics" | "dashboard" | "split" | "download" | "versions";

export interface ToolState {
  /** Motivo de indisponibilidade (fase futura ou contexto). Sem motivo = disponível. */
  unavailable?: string;
}

const TOOLS: { id: ToolId; label: string; icon: LucideIcon; group: 1 | 2 }[] = [
  { id: "review", label: "Revisão", icon: SquareCheck, group: 1 },
  { id: "code", label: "Dados estruturados (JSON)", icon: Braces, group: 1 },
  { id: "extract", label: "Extrator", icon: ExternalLink, group: 1 },
  { id: "assistant", label: "Assistente de IA", icon: HelpCircle, group: 1 },
  { id: "compare", label: "Lista de mudanças", icon: ArrowLeftRight, group: 2 },
  { id: "metrics", label: "Métricas", icon: BarChart3, group: 2 },
  { id: "dashboard", label: "Dashboard de comparação", icon: PieChart, group: 2 },
  { id: "split", label: "Visualização dividida", icon: Columns2, group: 2 },
  { id: "download", label: "Exportar", icon: FileDown, group: 2 },
  { id: "versions", label: "Navegação entre versões", icon: ArrowDownUp, group: 2 },
];

/** Barra lateral direita de ferramentas (referências 05–10). */
export function ToolRail({
  active,
  states,
  onSelect,
}: {
  active: ToolId | null;
  states: Partial<Record<ToolId, ToolState>>;
  onSelect: (id: ToolId) => void;
}) {
  return (
    <nav aria-label="Ferramentas" className="flex w-16 shrink-0 flex-col items-center gap-2 rounded-lg bg-surface py-4">
      {TOOLS.map((t, i) => {
        const state = states[t.id] ?? {};
        const disabled = Boolean(state.unavailable);
        return (
          <div key={t.id} className="contents">
            {i > 0 && TOOLS[i - 1]!.group !== t.group && <span className="my-2 h-px w-8 bg-line" aria-hidden />}
            <button
              type="button"
              onClick={() => !disabled && onSelect(t.id)}
              aria-label={t.label}
              aria-pressed={active === t.id}
              aria-disabled={disabled || undefined}
              title={disabled ? `${t.label} — ${state.unavailable}` : t.label}
              className={cn(
                "group relative flex size-11 items-center justify-center rounded-full transition-colors",
                active === t.id ? "text-brand" : disabled ? "cursor-not-allowed text-ink-subtle/60" : "text-ink-muted hover:text-ink",
              )}
            >
              <t.icon className="size-6" strokeWidth={1.4} />
              <span className="pointer-events-none absolute right-full mr-2 hidden whitespace-nowrap rounded-full bg-chip px-3 py-1 text-label font-medium text-on-light group-hover:block group-focus-visible:block">
                {t.label}
                {disabled ? ` · ${state.unavailable}` : ""}
              </span>
            </button>
          </div>
        );
      })}
    </nav>
  );
}


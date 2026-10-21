"use client";

import { Crosshair, type LucideIcon } from "lucide-react";
import type { Rect } from "@/lib/compare/types";
import type { Highlight } from "@/components/viewer/page-view";
import type { PaneHandle, ViewerDoc } from "@/components/viewer/document-pane";
import { cn } from "@/lib/utils";

/** Um trecho para localizar no documento aberto. */
export interface LocateTarget {
  versionId: string;
  page: number;
  rects: Rect[];
  from: number;
  to: number;
}

/** Rola até o trecho e devolve o destaque a desenhar. */
export function locateIn(pane: PaneHandle | null, doc: ViewerDoc, t: LocateTarget): Highlight {
  if (pane) {
    if (doc.kind === "docx" && t.from >= 0) pane.scrollToToken(t.from);
    else pane.scrollToPos({ page: t.page, y: t.rects[0]?.y ?? 0 }, { center: true, smooth: true });
  }
  return { key: `locate-${t.versionId}-${t.page}-${t.from}`, tone: "focus", rects: t.rects, ...(doc.kind === "docx" && t.from >= 0 ? { from: t.from, to: t.to } : {}) };
}

/** Botão "pág. N" que leva ao trecho de origem. */
export function SourceChip({ page, label, onClick, className }: { page: number; label?: string; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Localizar no documento"
      className={cn("inline-flex max-w-full items-center gap-1 rounded-full bg-page px-2 py-0.5 text-[11px] tabular-nums text-accent-strong hover:bg-overlay hover:text-ink", className)}
    >
      <Crosshair className="size-3 shrink-0" />
      <span className="truncate">
        pág. {page}
        {label ? ` · ${label}` : ""}
      </span>
    </button>
  );
}

/** Cabeçalho padrão dos painéis laterais (referências 06–08). */
export function PanelHeader({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-5 pb-3 pt-5">
      <Icon className="size-5 text-ink-muted" strokeWidth={1.5} />
      <h2 className="flex-1 text-body">{title}</h2>
      {children}
    </div>
  );
}

/** Seletor de lado (Original / Revisado) quando há dois documentos. */
export function DocTabs({ docs, active, onChange }: { docs: { versionId: string; label: string }[]; active: number; onChange: (i: number) => void }) {
  if (docs.length < 2) return null;
  return (
    <div className="mx-5 mb-3 grid grid-cols-2 rounded-full bg-sunken p-0.5" role="tablist" aria-label="Documento">
      {docs.map((d, i) => (
        <button key={d.versionId} type="button" role="tab" aria-selected={active === i} onClick={() => onChange(i)} className={cn("truncate rounded-full px-3 py-1 text-label", active === i ? "bg-chip font-semibold text-on-light" : "text-ink-muted hover:text-ink")}>
          {d.label}
        </button>
      ))}
    </div>
  );
}

export const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Baixa um texto como arquivo (no app; o navegador cuida do download). */
export function downloadText(name: string, text: string, type = "text/markdown") {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

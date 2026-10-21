import Link from "next/link";
import { LayoutGrid, List, Pin, Undo2 } from "lucide-react";
import { SearchField } from "@/components/ui/search-field";
import { cn } from "@/lib/utils";
import type { LibraryFilters } from "@/lib/queries/library";
import { UploadButton } from "./upload-dialog";

export type ViewMode = "icone" | "lista";

/** Monta a URL mantendo os filtros atuais. */
export function hrefWith(base: string, current: Record<string, string | undefined>, patch: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...current, ...patch })) if (v) params.set(k, v);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/** Barra superior das telas de documentos (referências 02–04). */
export function LibraryToolbar({
  base,
  view,
  filters,
  uploadFolderId,
  uploadDisabledReason,
  backHref,
  defaultView = "icone",
}: {
  base: string;
  view: ViewMode;
  filters: LibraryFilters;
  uploadFolderId?: string | null;
  uploadDisabledReason?: string;
  backHref?: string;
  /** Modo usado quando a URL não diz nada (a pasta abre em lista, o início em ícones). */
  defaultView?: ViewMode;
}) {
  const viewParam = (mode: ViewMode) => (mode === defaultView ? undefined : mode);
  const current = {
    view: viewParam(view),
    q: filters.q,
    ordem: filters.sort && filters.sort !== "recentes" ? filters.sort : undefined,
    tipo: filters.type,
    fixados: filters.pinned ? "1" : undefined,
  };
  return (
    <section className="grid items-center gap-4 rounded-lg bg-surface p-4 shadow-panel sm:p-6 lg:grid-cols-[auto_1fr_auto_auto_auto] lg:gap-8 lg:px-12">
      <nav className="flex items-center gap-8" aria-label="Modo de visualização">
        {(
          [
            ["icone", "Em ícone", LayoutGrid],
            ["lista", "Em lista", List],
          ] as const
        ).map(([mode, label, Icon]) => (
          <Link
            key={mode}
            href={hrefWith(base, current, { view: viewParam(mode) })}
            aria-current={view === mode ? "page" : undefined}
            className={cn("flex items-center gap-2 text-body transition-colors", view === mode ? "font-medium text-brand" : "text-ink-muted hover:text-ink")}
          >
            <Icon className="size-5" strokeWidth={1.5} /> {label}
          </Link>
        ))}
      </nav>

      <SearchField className="min-w-0" action={base} defaultValue={filters.q} hidden={{ view: current.view, ordem: current.ordem, tipo: current.tipo }} />

      <Link
        href={hrefWith(base, current, { fixados: filters.pinned ? undefined : "1" })}
        aria-pressed={filters.pinned}
        aria-label={filters.pinned ? "Mostrar tudo" : "Mostrar só os fixados"}
        title={filters.pinned ? "Mostrar tudo" : "Mostrar só os fixados"}
        className={cn(
          "flex size-11 items-center justify-center justify-self-start rounded-full transition-colors",
          filters.pinned ? "bg-brand text-on-light" : "bg-ink-subtle text-ink hover:bg-ink-muted",
        )}
      >
        <Pin className="size-5" />
      </Link>

      <UploadButton folderId={uploadFolderId} disabledReason={uploadDisabledReason} />

      {backHref ? (
        <Link href={backHref} className="flex items-center gap-2 justify-self-start text-body text-ink-muted hover:text-ink">
          <Undo2 className="size-5" strokeWidth={1.5} /> Voltar
        </Link>
      ) : (
        <span className="hidden lg:block" />
      )}
    </section>
  );
}

/** Filtros finos (ordem e tipo) logo acima dos resultados. */
export function LibraryFiltersBar({ base, view, filters, total }: { base: string; view: ViewMode; filters: LibraryFilters; total: number }) {
  const current = {
    view: view === "lista" ? "lista" : undefined,
    q: filters.q,
    ordem: filters.sort && filters.sort !== "recentes" ? filters.sort : undefined,
    tipo: filters.type,
    fixados: filters.pinned ? "1" : undefined,
  };
  const chip = (active: boolean) =>
    cn("rounded-full px-3 py-1 text-body-sm transition-colors", active ? "bg-chip font-medium text-on-light" : "text-ink-muted hover:bg-surface hover:text-ink");
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-body-sm">
      <p className="text-ink-muted">
        {filters.q ? (
          <>
            {total} {total === 1 ? "resultado" : "resultados"} para <strong className="text-ink">“{filters.q}”</strong>
          </>
        ) : filters.pinned ? (
          "Itens fixados"
        ) : (
          `${total} ${total === 1 ? "item" : "itens"}`
        )}
      </p>
      <div className="flex items-center gap-1" role="group" aria-label="Ordenar">
        <span className="mr-1 text-ink-subtle">Ordem</span>
        {(
          [
            [undefined, "Recentes"],
            ["nome", "Nome"],
            ["tamanho", "Tamanho"],
          ] as const
        ).map(([key, label]) => (
          <Link key={label} href={hrefWith(base, current, { ordem: key })} className={chip((current.ordem ?? undefined) === key)}>
            {label}
          </Link>
        ))}
      </div>
      <div className="flex items-center gap-1" role="group" aria-label="Tipo de arquivo">
        <span className="mr-1 text-ink-subtle">Tipo</span>
        {(
          [
            [undefined, "Todos"],
            ["pdf", "PDF"],
            ["docx", "DOCX"],
          ] as const
        ).map(([key, label]) => (
          <Link key={label} href={hrefWith(base, current, { tipo: key })} className={chip(current.tipo === key)}>
            {label}
          </Link>
        ))}
      </div>
      {(filters.q || filters.type || filters.pinned) && (
        <Link href={hrefWith(base, { view: current.view }, {})} className="text-accent-strong hover:underline">
          Limpar filtros
        </Link>
      )}
    </div>
  );
}

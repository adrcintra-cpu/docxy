import type { LibraryFilters, SortKey } from "./library";
import type { ViewMode } from "@/components/documents/library-toolbar";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Lê view, pesquisa, ordem, tipo e fixados da URL, ignorando valores inválidos. */
export async function readLibraryParams(searchParams: SearchParams): Promise<{ view: ViewMode; filters: LibraryFilters }> {
  const sp = await searchParams;
  const ordem = one(sp.ordem);
  const tipo = one(sp.tipo);
  const q = one(sp.q)?.trim().slice(0, 120);
  return {
    view: one(sp.view) === "lista" ? "lista" : "icone",
    filters: {
      q: q || undefined,
      sort: ordem === "nome" || ordem === "tamanho" ? (ordem as SortKey) : "recentes",
      type: tipo === "pdf" || tipo === "docx" ? tipo : undefined,
      pinned: one(sp.fixados) === "1",
    },
  };
}

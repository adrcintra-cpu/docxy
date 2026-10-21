"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Download, Expand, FileText, Minus, MoreVertical, Plus, Search, X } from "lucide-react";
import type { PageText } from "@/lib/compare/types";
import { looseForm } from "@/lib/compare/normalize";
import { cn } from "@/lib/utils";
import { PageView, type Highlight } from "./page-view";

export interface ViewerDoc {
  versionId: string;
  documentId: string;
  title: string;
  fileName: string;
  versionNumber: number;
  kind: "pdf" | "docx";
  pages: PageText[];
  /** Índice de token por palavra (para destaques em DOCX). */
  tokenIndex: number[][];
  canDownload: boolean;
}

/** Posição contínua no documento: página (1…n) + fração vertical (0–1). */
export interface DocPos {
  page: number;
  y: number;
}

export interface PaneHandle {
  scrollToPos: (pos: DocPos, opts?: { center?: boolean; smooth?: boolean }) => void;
  scrollToToken: (token: number) => void;
  getPos: () => DocPos;
  element: () => HTMLDivElement | null;
}

type Zoom = { mode: "width" } | { mode: "page" } | { mode: "scale"; value: number };
const PAGE_GAP = 16;

/**
 * Painel de leitura de um documento (referência 05): cabeçalho com título e fechar,
 * pesquisa, navegação de página, zoom, ajuste à largura/página, tela cheia e download.
 */
export const DocumentPane = forwardRef<
  PaneHandle,
  {
    doc: ViewerDoc;
    highlights: Highlight[];
    onClose?: () => void;
    onScroll?: (pos: DocPos) => void;
    onHighlightClick?: (changeId: string) => void;
    className?: string;
  }
>(function DocumentPane({ doc, highlights, onClose, onScroll, onHighlightClick, className }, ref) {
  const root = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [boxWidth, setBoxWidth] = useState(800);
  const [boxHeight, setBoxHeight] = useState(900);
  const [zoom, setZoom] = useState<Zoom>({ mode: "width" });
  const [current, setCurrent] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [matchIndex, setMatchIndex] = useState(0);
  const [menu, setMenu] = useState(false);
  const total = doc.pages.length;

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setBoxWidth(el.clientWidth);
      setBoxHeight(el.clientHeight);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Largura da página na tela conforme o zoom.
  const first = doc.pages[0];
  const aspect = first && first.width > 0 ? first.height / first.width : 1.414;
  const fitWidth = Math.max(240, boxWidth - 48);
  const pageWidth =
    zoom.mode === "width" ? fitWidth : zoom.mode === "page" ? Math.min(fitWidth, (boxHeight - 32) / aspect) : Math.max(200, fitWidth * zoom.value);
  const zoomPercent = Math.round((pageWidth / fitWidth) * 100);

  // ─── Pesquisa no texto extraído (ignora acentos e maiúsculas) ─────────
  const matches = useMemo(() => {
    const q = query.trim().split(/\s+/).map(looseForm).filter(Boolean);
    if (q.length === 0) return [] as { page: number; tokens: number[]; rects: Highlight["rects"] }[];
    const out: { page: number; tokens: number[]; rects: Highlight["rects"] }[] = [];
    doc.pages.forEach((p, pi) => {
      const words = p.words.map((w) => looseForm(w.t));
      for (let i = 0; i <= words.length - q.length; i++) {
        // Palavra única: contém. Frase: palavras iguais, a última pode estar incompleta.
        const ok = q.every((qk, k) => {
          const w = words[i + k]!;
          if (q.length === 1) return w.includes(qk);
          return k === q.length - 1 ? w.startsWith(qk) : w === qk;
        });
        if (!ok) continue;
        const ws = p.words.slice(i, i + q.length);
        out.push({
          page: p.page,
          tokens: ws.map((_, k) => doc.tokenIndex[pi]?.[i + k] ?? -1),
          rects: ws.filter((w) => w.w > 0).map((w) => ({ page: p.page, x: w.x, y: w.y, w: w.w, h: w.h })),
        });
      }
    });
    return out.slice(0, 500);
  }, [query, doc.pages, doc.tokenIndex]);

  const allHighlights = useMemo(() => {
    const search: Highlight[] = matches.map((m, i) => ({
      key: `s${i}`,
      tone: i === matchIndex ? "focus" : "search",
      rects: m.rects,
      ...(doc.kind === "docx" ? { from: Math.min(...m.tokens.filter((t) => t >= 0)), to: Math.max(...m.tokens) + 1 } : {}),
    }));
    return [...highlights, ...search];
  }, [highlights, matches, matchIndex, doc.kind]);

  const byPage = useMemo(() => {
    const map = new Map<number, Highlight[]>();
    for (const h of allHighlights) {
      const pages = new Set<number>((h.rects ?? []).map((r) => r.page));
      if (h.from !== undefined) for (const p of doc.pages) pages.add(p.page); // DOCX: a página decide pelo índice
      for (const p of pages) map.set(p, [...(map.get(p) ?? []), h]);
    }
    return map;
  }, [allHighlights, doc.pages]);

  // ─── Posição e rolagem ─────────────────────────────────────────────────
  const pageEl = useCallback((n: number) => scroller.current?.querySelector<HTMLElement>(`[data-page="${n}"]`) ?? null, []);

  const getPos = useCallback((): DocPos => {
    const el = scroller.current;
    if (!el) return { page: 1, y: 0 };
    const top = el.scrollTop + 1;
    for (let n = 1; n <= total; n++) {
      const p = pageEl(n);
      if (!p) continue;
      if (p.offsetTop + p.offsetHeight + PAGE_GAP > top) return { page: n, y: Math.max(0, Math.min(1, (top - p.offsetTop) / p.offsetHeight)) };
    }
    return { page: total, y: 1 };
  }, [pageEl, total]);

  const scrollToPos = useCallback(
    (pos: DocPos, opts: { center?: boolean; smooth?: boolean } = {}) => {
      const el = scroller.current;
      const p = pageEl(Math.max(1, Math.min(total, pos.page)));
      if (!el || !p) return;
      const target = p.offsetTop + pos.y * p.offsetHeight - (opts.center ? el.clientHeight * 0.35 : 0);
      el.scrollTo({ top: Math.max(0, target), behavior: opts.smooth ? "smooth" : "auto" });
    },
    [pageEl, total],
  );

  const scrollToToken = useCallback((token: number) => {
    const span = scroller.current?.querySelector<HTMLElement>(`[data-tok="${token}"]`);
    span?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, []);

  useImperativeHandle(ref, () => ({ scrollToPos, scrollToToken, getPos, element: () => scroller.current }), [scrollToPos, scrollToToken, getPos]);

  const handleScroll = () => {
    const pos = getPos();
    const n = pos.y > 0.6 && pos.page < total ? pos.page + 1 : pos.page;
    if (n !== current) {
      setCurrent(n);
      setPageInput(String(n));
    }
    onScroll?.(pos);
  };

  const goPage = (n: number) => scrollToPos({ page: Math.max(1, Math.min(total, n)), y: 0 }, { smooth: true });

  const goMatch = (dir: 1 | -1) => {
    if (matches.length === 0) return;
    const next = (matchIndex + dir + matches.length) % matches.length;
    setMatchIndex(next);
    const m = matches[next]!;
    if (m.rects && m.rects.length) scrollToPos({ page: m.page, y: m.rects[0]!.y }, { center: true, smooth: true });
    else if (m.tokens[0] !== undefined) scrollToToken(m.tokens[0]);
  };

  const step = (dir: 1 | -1) => setZoom({ mode: "scale", value: Math.max(0.4, Math.min(3, Math.round((zoomPercent / 100 + dir * 0.15) * 100) / 100)) });

  return (
    <section ref={root} className={cn("flex min-h-0 min-w-0 flex-col rounded-lg bg-surface", className)} aria-label={doc.title}>
      <header className="flex items-center gap-3 border-b border-line/60 px-4 py-3">
        <FileText className="size-5 shrink-0 text-ink-muted" strokeWidth={1.5} />
        <h2 className="min-w-0 flex-1 truncate text-body" title={`${doc.title} · vs${String(doc.versionNumber).padStart(2, "0")}`}>
          {doc.title} <span className="text-ink-muted">· vs{String(doc.versionNumber).padStart(2, "0")}</span>
        </h2>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Fechar documento" className="rounded-full p-1 text-ink-muted hover:text-ink">
            <X className="size-5" strokeWidth={1.5} />
          </button>
        )}
      </header>

      <div className="flex items-center gap-2 px-3 py-2">
        {searchOpen ? (
          <form
            role="search"
            className="flex min-w-0 flex-1 items-center gap-1 rounded-full bg-page px-3"
            onSubmit={(e) => {
              e.preventDefault();
              goMatch(1);
            }}
          >
            <Search className="size-4 shrink-0 text-ink-muted" />
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setMatchIndex(-1);
              }}
              onKeyDown={(e) => e.key === "Escape" && (setSearchOpen(false), setQuery(""))}
              placeholder="Pesquisar no documento"
              aria-label="Pesquisar no documento"
              className="h-8 min-w-0 flex-1 bg-transparent text-body-sm focus:outline-none"
            />
            {query && <span className="shrink-0 text-label tabular-nums text-ink-muted">{matches.length ? `${Math.max(matchIndex + 1, 0)}/${matches.length}` : "0"}</span>}
            <button type="button" aria-label="Resultado anterior" onClick={() => goMatch(-1)} className="p-1 text-ink-muted hover:text-ink">
              <ArrowUp className="size-4" />
            </button>
            <button type="submit" aria-label="Próximo resultado" className="p-1 text-ink-muted hover:text-ink">
              <ArrowDown className="size-4" />
            </button>
            <button type="button" aria-label="Fechar pesquisa" onClick={() => (setSearchOpen(false), setQuery(""))} className="p-1 text-ink-muted hover:text-ink">
              <X className="size-4" />
            </button>
          </form>
        ) : (
          <>
            <button type="button" aria-label="Pesquisar no documento" onClick={() => setSearchOpen(true)} className="rounded-full p-1.5 text-ink-muted hover:text-ink">
              <Search className="size-5" strokeWidth={1.5} />
            </button>
            <div className="mx-auto flex items-center gap-2">
              <button type="button" aria-label="Próxima página" onClick={() => goPage(current + 1)} disabled={current >= total} className="p-1 text-ink-muted hover:text-ink disabled:opacity-40">
                <ArrowDown className="size-5" strokeWidth={1.5} />
              </button>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  goPage(parseInt(pageInput, 10) || 1);
                }}
              >
                <label className="sr-only" htmlFor={`pg-${doc.versionId}`}>
                  Página
                </label>
                <input
                  id={`pg-${doc.versionId}`}
                  value={pageInput}
                  onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ""))}
                  inputMode="numeric"
                  className="h-9 w-12 rounded-sm bg-page text-center text-body-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </form>
              <span className="text-label text-ink-muted tabular-nums">/ {total}</span>
              <button type="button" aria-label="Página anterior" onClick={() => goPage(current - 1)} disabled={current <= 1} className="p-1 text-ink-muted hover:text-ink disabled:opacity-40">
                <ArrowUp className="size-5" strokeWidth={1.5} />
              </button>
            </div>
          </>
        )}
        <div className="flex items-center">
          <button type="button" aria-label="Diminuir zoom" onClick={() => step(-1)} className="hidden p-1 text-ink-muted hover:text-ink xl:block">
            <Minus className="size-4" />
          </button>
          <span className="hidden w-10 text-center text-label tabular-nums text-ink-muted xl:block">{zoomPercent}%</span>
          <button type="button" aria-label="Aumentar zoom" onClick={() => step(1)} className="hidden p-1 text-ink-muted hover:text-ink xl:block">
            <Plus className="size-4" />
          </button>
          <button type="button" aria-label="Tela cheia" title="Tela cheia" onClick={() => root.current?.requestFullscreen?.().catch(() => undefined)} className="rounded-full p-1.5 text-ink-muted hover:text-ink">
            <Expand className="size-5" strokeWidth={1.5} />
          </button>
          <div className="relative">
            <button type="button" aria-label="Mais opções" aria-expanded={menu} onClick={() => setMenu((v) => !v)} className="rounded-full p-1.5 text-ink-muted hover:text-ink">
              <MoreVertical className="size-5" strokeWidth={1.5} />
            </button>
            {menu && (
              <ul className="absolute right-0 z-30 mt-1 w-48 rounded-md border border-line bg-overlay p-1 text-body-sm shadow-panel" onClick={() => setMenu(false)}>
                <li>
                  <button type="button" onClick={() => setZoom({ mode: "width" })} className="w-full rounded-sm px-3 py-2 text-left hover:bg-surface">
                    Ajustar à largura
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => setZoom({ mode: "page" })} className="w-full rounded-sm px-3 py-2 text-left hover:bg-surface">
                    Ajustar à página
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => step(1)} className="w-full rounded-sm px-3 py-2 text-left hover:bg-surface">
                    Aumentar zoom
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => step(-1)} className="w-full rounded-sm px-3 py-2 text-left hover:bg-surface">
                    Diminuir zoom
                  </button>
                </li>
                {doc.canDownload && (
                  <li>
                    <a href={`/api/versions/${doc.versionId}?download=1`} className="flex items-center gap-2 rounded-sm px-3 py-2 hover:bg-surface">
                      <Download className="size-4" /> Baixar
                    </a>
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div ref={scroller} onScroll={handleScroll} className="relative min-h-0 flex-1 overflow-auto rounded-b-lg bg-sunken px-6 py-4" tabIndex={0} aria-label={`Páginas de ${doc.title}`}>
        <div className="flex flex-col items-center" style={{ gap: PAGE_GAP }}>
          {doc.pages.map((p, i) => (
            <PageView
              key={p.page}
              versionId={doc.versionId}
              kind={doc.kind}
              page={p}
              width={pageWidth}
              highlights={byPage.get(p.page) ?? []}
              tokenIndex={doc.tokenIndex[i]}
              onHighlightClick={onHighlightClick}
            />
          ))}
        </div>
      </div>
    </section>
  );
});

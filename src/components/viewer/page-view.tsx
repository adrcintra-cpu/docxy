"use client";

import { memo, useEffect, useRef, useState } from "react";
import type { PageText, Rect } from "@/lib/compare/types";
import { cn } from "@/lib/utils";
import { loadPdf } from "./pdf";

export type HighlightTone = "removed" | "inserted" | "moved" | "search" | "focus";

export interface Highlight {
  key: string;
  tone: HighlightTone;
  /** Caixas normalizadas (PDF). */
  rects?: Rect[];
  /** Intervalo de tokens [from, to) (DOCX). */
  from?: number;
  to?: number;
  active?: boolean;
  /** Identifica a alteração, para o clique no destaque. */
  changeId?: string;
}

const TONE: Record<HighlightTone, string> = {
  removed: "bg-removed/25 ring-1 ring-removed/70",
  inserted: "bg-inserted/35 ring-1 ring-inserted/80",
  moved: "bg-chart/25 ring-1 ring-chart/70",
  search: "bg-brand/50",
  focus: "bg-brand/40 ring-2 ring-brand",
};
const TEXT_TONE: Record<HighlightTone, string> = {
  removed: "text-removed font-semibold",
  inserted: "text-[#8a9a0c] font-semibold",
  moved: "text-[#1f8fc0] font-semibold",
  search: "bg-brand/60 rounded-[2px]",
  focus: "bg-brand/50 rounded-[2px]",
};

/**
 * Uma página do documento.
 * PDF: canvas renderizado pelo PDF.js quando entra na tela + camada de destaques.
 * DOCX: "papel" com o texto refluído; destaques pelos índices de token.
 */
export const PageView = memo(function PageView({
  versionId,
  kind,
  page,
  width,
  highlights,
  tokenIndex,
  onHighlightClick,
}: {
  versionId: string;
  kind: "pdf" | "docx";
  page: PageText;
  /** Largura da página na tela, em px. */
  width: number;
  highlights: Highlight[];
  tokenIndex?: number[];
  onHighlightClick?: (changeId: string) => void;
}) {
  if (kind === "docx") return <DocxPage page={page} width={width} highlights={highlights} tokenIndex={tokenIndex ?? []} onHighlightClick={onHighlightClick} />;
  return <PdfPage versionId={versionId} page={page} width={width} highlights={highlights} onHighlightClick={onHighlightClick} />;
});

function PdfPage({
  versionId,
  page,
  width,
  highlights,
  onHighlightClick,
}: {
  versionId: string;
  page: PageText;
  width: number;
  highlights: Highlight[];
  onHighlightClick?: (changeId: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState(false);
  const height = page.width > 0 ? (width * page.height) / page.width : width * 1.414;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && setVisible(true), { rootMargin: "800px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !canvas.current) return;
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null;
    (async () => {
      try {
        const pdf = await loadPdf(versionId);
        const p = await pdf.getPage(page.page);
        if (cancelled || !canvas.current) return;
        const base = p.getViewport({ scale: 1 });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = p.getViewport({ scale: (width / base.width) * dpr });
        const c = canvas.current;
        c.width = Math.floor(viewport.width);
        c.height = Math.floor(viewport.height);
        const render = p.render({ canvas: c, viewport });
        task = render;
        await render.promise;
      } catch (err) {
        if (!cancelled && !(err instanceof Error && err.name === "RenderingCancelledException")) setError(true);
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [visible, versionId, page.page, width]);

  return (
    <div ref={box} data-page={page.page} className="relative mx-auto bg-paper shadow-[0_2px_12px_rgba(0,0,0,.35)]" style={{ width, height }}>
      <canvas ref={canvas} className="absolute inset-0 size-full" aria-label={`Página ${page.page}`} />
      {error && <p className="absolute inset-0 flex items-center justify-center text-body-sm text-on-light/60">Não foi possível desenhar esta página.</p>}
      {page.ocr && <span className="absolute right-2 top-2 rounded-full bg-on-light/70 px-2 py-0.5 text-label text-ink">OCR</span>}
      <div className="absolute inset-0">
        {highlights.flatMap((h) =>
          (h.rects ?? [])
            .filter((r) => r.page === page.page)
            .map((r, i) => (
              <span
                key={`${h.key}-${i}`}
                data-hl={h.changeId}
                onClick={h.changeId && onHighlightClick ? () => onHighlightClick(h.changeId!) : undefined}
                className={cn("absolute rounded-[2px] mix-blend-multiply transition-shadow", TONE[h.tone], h.active && "ring-2 ring-brand", h.changeId && "cursor-pointer")}
                style={{
                  left: `${(r.x - 0.002) * 100}%`,
                  top: `${(r.y - 0.002) * 100}%`,
                  width: `${(r.w + 0.004) * 100}%`,
                  height: `${(r.h + 0.004) * 100}%`,
                }}
              />
            )),
        )}
      </div>
    </div>
  );
}

function DocxPage({
  page,
  width,
  highlights,
  tokenIndex,
  onHighlightClick,
}: {
  page: PageText;
  width: number;
  highlights: Highlight[];
  tokenIndex: number[];
  onHighlightClick?: (changeId: string) => void;
}) {
  const ranged = highlights.filter((h) => h.from !== undefined && h.to !== undefined);
  const paragraphs: { idx: number; t: string; br: boolean }[][] = [];
  page.words.forEach((w, i) => {
    if (w.pb || paragraphs.length === 0) paragraphs.push([]);
    paragraphs[paragraphs.length - 1]!.push({ idx: i, t: w.t, br: Boolean(w.lb && !w.pb) });
  });
  const font = Math.max(10, Math.min(16, width / 52));

  return (
    <div data-page={page.page} className="relative mx-auto bg-paper px-[8%] py-[7%] text-on-light shadow-[0_2px_12px_rgba(0,0,0,.35)]" style={{ width, minHeight: width * 1.2, fontSize: font, lineHeight: 1.55 }}>
      {paragraphs.map((para, pi) => (
        <p key={pi} className="mb-[0.9em]">
          {para.map((w) => {
            const tok = tokenIndex[w.idx] ?? -1;
            const hit = ranged.find((h) => tok >= h.from! && tok < h.to!);
            return (
              <span key={w.idx}>
                {w.br && <br />}
                <span
                  data-tok={tok}
                  data-hl={hit?.changeId}
                  onClick={hit?.changeId && onHighlightClick ? () => onHighlightClick(hit.changeId!) : undefined}
                  className={cn(hit && TEXT_TONE[hit.tone], hit?.active && "rounded-[2px] outline outline-2 outline-brand", hit?.changeId && "cursor-pointer")}
                >
                  {w.t}
                </span>{" "}
              </span>
            );
          })}
        </p>
      ))}
      {page.words.length === 0 && <p className="text-center opacity-60">Página sem texto.</p>}
    </div>
  );
}

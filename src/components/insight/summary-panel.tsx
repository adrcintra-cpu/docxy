"use client";

import { useState, useTransition } from "react";
import { Copy, Download, FileText } from "lucide-react";
import { generateSummary } from "@/app/actions/assistant";
import { SUMMARY_KINDS, SUMMARY_LABEL, type Summary, type SummaryKind } from "@/lib/assist/types";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { copyText, downloadText, PanelHeader, SourceChip, type LocateTarget } from "./shared";
import type { AssistantScope } from "./assistant-panel";

const SHORT: Record<SummaryKind, string> = { executive: "Executivo", changes: "Alterações", contract: "Contratual", risks: "Riscos", financial: "Financeiro" };

/** Resumos inteligentes, com copiar e exportar. */
export function SummaryPanel({ scope, titles, fileBase, onLocate }: { scope: AssistantScope; titles: Record<string, string>; fileBase: string; onLocate: (t: LocateTarget) => void }) {
  const kinds = SUMMARY_KINDS.filter((k) => k !== "changes" || scope.comparisonId);
  const [kind, setKind] = useState<SummaryKind>(scope.comparisonId ? "changes" : "executive");
  const [data, setData] = useState<Partial<Record<SummaryKind, { summary: Summary; markdown: string; note?: string }>>>({});
  const [pending, start] = useTransition();
  const current = data[kind];

  const generate = (k = kind) =>
    start(async () => {
      const res = await generateSummary({ kind: k, ...scope });
      if (!res.ok) return toast(res.error, "error");
      setData((d) => ({ ...d, [k]: res.data! }));
    });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader icon={FileText} title="Resumo" />
      <div className="flex flex-wrap gap-1 px-5" role="tablist" aria-label="Tipo de resumo">
        {kinds.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={kind === k}
            onClick={() => {
              setKind(k);
              if (!data[k]) generate(k);
            }}
            className={cn("rounded-full px-2.5 py-1 text-label", kind === k ? "bg-chip font-semibold text-on-light" : "text-ink-muted hover:bg-sunken hover:text-ink")}
          >
            {SHORT[k]}
          </button>
        ))}
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-5 pb-3" aria-live="polite">
        {!current ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-body-sm text-ink-muted">{pending ? "Gerando resumo…" : `${SUMMARY_LABEL[kind]} a partir do conteúdo do documento.`}</p>
            {!pending && (
              <Button size="sm" onClick={() => generate()}>
                Gerar resumo
              </Button>
            )}
          </div>
        ) : (
          <article className="flex flex-col gap-4">
            <p className="text-[10px] uppercase tracking-caps text-ink-subtle">{current.summary.generatedBy === "ia" ? "IA · a partir de fatos verificados" : "Por regras · sem IA"}</p>
            {current.note && <p className="rounded-sm bg-page px-3 py-2 text-label text-ink-muted">{current.note}</p>}
            {current.summary.notice && <p className="rounded-sm bg-page px-3 py-2 text-body-sm text-ink-muted">{current.summary.notice}</p>}
            {current.summary.sections.map((s) => (
              <section key={s.heading}>
                <h3 className="mb-1.5 text-label font-semibold text-ink">{s.heading}</h3>
                <ul className="flex flex-col gap-2">
                  {s.items.map((it, i) => (
                    <li key={i} className="text-body-sm text-ink-muted">
                      <p className="whitespace-pre-line">{it.text}</p>
                      {it.citations.length > 0 && (
                        <span className="mt-1 flex flex-wrap gap-1">
                          {it.citations.slice(0, 3).map((c, j) => (
                            <SourceChip key={`${c.id}-${j}`} page={c.page} label={Object.keys(titles).length > 1 ? titles[c.versionId] : undefined} onClick={() => onLocate(c)} />
                          ))}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {current.summary.disclaimer && <p className="border-l-2 border-brand/70 pl-2 text-label text-ink-subtle">{current.summary.disclaimer}</p>}
          </article>
        )}
      </div>

      {current && (
        <div className="flex items-center gap-2 border-t border-line/50 p-3">
          <button type="button" onClick={async () => { const okCopy = await copyText(current.markdown); toast(okCopy ? "Resumo copiado." : "Não foi possível copiar. Use Exportar.", okCopy ? "ok" : "error"); }} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-sunken py-2 text-label text-ink hover:bg-page">
            <Copy className="size-4" /> Copiar
          </button>
          <button type="button" onClick={() => downloadText(`${fileBase} - ${SUMMARY_LABEL[kind]}.md`, current.markdown)} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-sunken py-2 text-label text-ink hover:bg-page">
            <Download className="size-4" /> Exportar .md
          </button>
          <button type="button" onClick={() => generate()} disabled={pending} className="rounded-full px-3 py-2 text-label text-ink-muted hover:text-ink disabled:opacity-50">
            Gerar de novo
          </button>
        </div>
      )}
    </div>
  );
}

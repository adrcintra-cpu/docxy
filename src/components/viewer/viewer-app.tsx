"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, FileText, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { CompareDialog, type VersionOption } from "@/components/compare/compare-dialog";
import { toast } from "@/components/ui/toast";
import type { ExtractionView, ExtractorView } from "@/lib/extract/server";
import { AskBar, AssistantPanel, useAssistant } from "@/components/insight/assistant-panel";
import { ExtractorPanel } from "@/components/insight/extractor-panel";
import { fieldsJson, JsonPanel } from "@/components/insight/json-panel";
import { locateIn, type LocateTarget } from "@/components/insight/shared";
import { SummaryPanel } from "@/components/insight/summary-panel";
import { DocumentPane, type PaneHandle, type ViewerDoc } from "./document-pane";
import type { Highlight } from "./page-view";
import { ToolRail, type ToolId } from "./tool-rail";

type Panel = "extract" | "assistant" | "summary" | "code";

/** Visualizador de um documento (referência 05). */
export function ViewerApp({
  doc,
  versions,
  options,
  processingNote,
  ready,
  extractors,
  extractions: initialExtractions,
  canExtract,
  canAsk,
}: {
  doc: ViewerDoc;
  versions: { id: string; label: string; current: boolean }[];
  options: VersionOption[];
  processingNote?: string;
  /** Texto já lido (extração, assistente e resumos dependem dele). */
  ready: boolean;
  extractors: ExtractorView[];
  extractions: ExtractionView[];
  canExtract: boolean;
  canAsk: boolean;
}) {
  const router = useRouter();
  const pane = useRef<PaneHandle>(null);
  const [comparing, setComparing] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [focusHl, setFocusHl] = useState<Highlight | null>(null);
  const [extractions, setExtractions] = useState(initialExtractions);
  const assistant = useAssistant({ versionIds: [doc.versionId] });
  const title = `${doc.title} (vs${String(doc.versionNumber).padStart(2, "0")})`;
  const notReady = ready ? undefined : "aguarde a leitura do texto";

  const locate = (t: LocateTarget) => setFocusHl(locateIn(pane.current, doc, t));
  const toggle = (p: Panel) => setPanel((cur) => (cur === p ? null : p));

  const onTool = (id: ToolId) => {
    if (id === "extract" || id === "assistant" || id === "code") toggle(id);
    if (id === "compare" || id === "split") setComparing(true);
    if (id === "download") {
      if (doc.canDownload) window.location.href = `/api/versions/${doc.versionId}?download=1`;
      else toast("Seu perfil não permite baixar este arquivo.", "error");
    }
    if (id === "versions") setVersionsOpen((v) => !v);
  };

  return (
    <div className="flex min-h-[calc(100dvh-140px)] flex-1 gap-4">
      {/* Trilho esquerdo: versões abertas (referência 05) */}
      <nav aria-label="Versões" className="flex w-16 shrink-0 flex-col items-center gap-3 rounded-lg bg-surface py-4">
        <button type="button" onClick={() => setComparing(true)} aria-label="Abrir outro documento para comparar" title="Comparar com outro documento" className="flex size-11 items-center justify-center rounded-full text-ink-muted hover:text-ink">
          <Plus className="size-6" strokeWidth={1.4} />
        </button>
        <span className="h-px w-8 bg-line" aria-hidden />
        {versions.map((v) => (
          <Link
            key={v.id}
            href={`?v=${v.id}`}
            aria-label={v.label}
            title={v.label}
            aria-current={v.id === doc.versionId ? "page" : undefined}
            className={cn("relative flex size-11 items-center justify-center rounded-full", v.id === doc.versionId ? "text-brand" : "text-ink-muted hover:text-ink")}
          >
            <FileText className="size-6" strokeWidth={1.4} />
            <span className="absolute -bottom-0.5 text-[9px] font-semibold tabular-nums">{v.label.slice(0, 4)}</span>
          </Link>
        ))}
      </nav>

      <div className="relative flex min-w-0 flex-1 flex-col gap-3">
        {processingNote && <p className="rounded-md bg-surface px-4 py-2 text-body-sm text-ink-muted">{processingNote}</p>}
        <DocumentPane ref={pane} doc={doc} highlights={focusHl ? [focusHl] : []} onClose={() => router.push(`/documentos/${doc.documentId}`)} className="min-h-0 flex-1" />
        {ready && canAsk && <AskBar state={assistant} onOpenConversation={() => setPanel("assistant")} onOpenSummary={() => setPanel("summary")} />}
        {versionsOpen && (
          <div className="absolute right-2 top-14 z-30 w-64 rounded-lg border border-line/70 bg-page p-3 shadow-panel">
            <p className="mb-2 text-label font-semibold">Versões</p>
            <ul className="flex flex-col gap-1">
              {versions.map((v) => (
                <li key={v.id}>
                  <Link href={`?v=${v.id}`} onClick={() => setVersionsOpen(false)} className={cn("flex items-center justify-between rounded-sm px-2 py-1.5 text-body-sm hover:bg-surface", v.id === doc.versionId && "text-brand")}>
                    {v.label}
                    {v.current && <span className="rounded-full bg-brand px-1.5 text-[10px] font-semibold text-on-light">Atual</span>}
                  </Link>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => (setVersionsOpen(false), setComparing(true))} className="mt-2 flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-body-sm text-accent-strong hover:bg-surface">
              Comparar versões <ArrowRight className="size-4" />
            </button>
          </div>
        )}
      </div>

      {panel && (
        <aside className="animate-pop flex w-[320px] shrink-0 flex-col rounded-lg bg-surface max-lg:fixed max-lg:inset-y-4 max-lg:right-4 max-lg:z-40 max-lg:shadow-panel" aria-label="Painel de ferramentas">
          {panel === "extract" && (
            <ExtractorPanel
              docs={[{ versionId: doc.versionId, title, label: "Documento" }]}
              extractors={extractors}
              initial={extractions}
              canRun={canExtract}
              onLocate={locate}
              onResult={(v) => setExtractions((xs) => [v, ...xs.filter((x) => x.extractorId !== v.extractorId)])}
            />
          )}
          {panel === "assistant" && <AssistantPanel state={assistant} titles={{ [doc.versionId]: title }} onLocate={locate} />}
          {panel === "summary" && <SummaryPanel scope={{ versionIds: [doc.versionId] }} titles={{ [doc.versionId]: title }} fileBase={title} onLocate={locate} />}
          {panel === "code" && (
            <JsonPanel
              fileBase={title}
              empty={extractions.length ? undefined : "Rode um extrator para gerar os dados estruturados deste documento."}
              data={{
                documento: { titulo: doc.title, versao: doc.versionNumber, arquivo: doc.fileName, paginas: doc.pages.length },
                extracoes: extractions.map((x) => ({ extrator: extractors.find((e) => e.id === x.extractorId)?.name ?? x.extractorId, em: x.createdAt, campos: fieldsJson(x.values) })),
              }}
            />
          )}
        </aside>
      )}

      <ToolRail
        active={versionsOpen ? "versions" : panel === "summary" ? "assistant" : panel}
        onSelect={onTool}
        states={{
          review: { unavailable: "abra uma comparação para revisar diferenças" },
          metrics: { unavailable: "abra uma comparação para ver as métricas" },
          code: notReady ? { unavailable: notReady } : {},
          extract: notReady ? { unavailable: notReady } : canExtract ? {} : { unavailable: "seu perfil não permite extrair" },
          assistant: notReady ? { unavailable: notReady } : canAsk ? {} : { unavailable: "seu perfil não permite usar o assistente" },
          dashboard: { unavailable: "abra uma comparação para ver o dashboard" },
          download: doc.canDownload ? {} : { unavailable: "seu perfil não permite baixar" },
        }}
      />

      {comparing && <CompareDialog options={options} defaultRevised={doc.versionId} onClose={() => setComparing(false)} />}
    </div>
  );
}

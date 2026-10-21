"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, FileText, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { CompareDialog, type VersionOption } from "@/components/compare/compare-dialog";
import { toast } from "@/components/ui/toast";
import { DocumentPane, type ViewerDoc } from "./document-pane";
import { ToolRail, type ToolId } from "./tool-rail";

const PHASE4 = "Fase 4";

/** Visualizador de um documento (referência 05). */
export function ViewerApp({
  doc,
  versions,
  options,
  processingNote,
}: {
  doc: ViewerDoc;
  versions: { id: string; label: string; current: boolean }[];
  options: VersionOption[];
  processingNote?: string;
}) {
  const router = useRouter();
  const [comparing, setComparing] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);

  const onTool = (id: ToolId) => {
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
        <DocumentPane doc={doc} highlights={[]} onClose={() => router.push(`/documentos/${doc.documentId}`)} className="min-h-0 flex-1" />
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

      <ToolRail
        active={versionsOpen ? "versions" : null}
        onSelect={onTool}
        states={{
          review: { unavailable: "abra uma comparação para revisar diferenças" },
          metrics: { unavailable: "abra uma comparação para ver as métricas" },
          code: { unavailable: PHASE4 },
          extract: { unavailable: PHASE4 },
          assistant: { unavailable: PHASE4 },
          dashboard: { unavailable: PHASE4 },
          download: doc.canDownload ? {} : { unavailable: "seu perfil não permite baixar" },
        }}
      />

      {comparing && <CompareDialog options={options} defaultRevised={doc.versionId} onClose={() => setComparing(false)} />}
    </div>
  );
}

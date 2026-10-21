"use client";

import { useMemo } from "react";
import { Braces, Copy, Download } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { copyText, downloadText, PanelHeader } from "./shared";

/** Dados estruturados (JSON) do documento ou da comparação, para copiar ou exportar. */
export function JsonPanel({ data, fileBase, empty }: { data: unknown; fileBase: string; empty?: string }) {
  const text = useMemo(() => JSON.stringify(data, null, 2), [data]);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader icon={Braces} title="Dados estruturados" />
      {empty ? (
        <p className="px-5 py-10 text-center text-body-sm text-ink-muted">{empty}</p>
      ) : (
        <pre className="mx-4 min-h-0 flex-1 overflow-auto rounded-md bg-sunken p-3 font-mono text-[11px] leading-relaxed text-ink-muted" tabIndex={0} aria-label="JSON">
          {text}
        </pre>
      )}
      <div className="flex items-center gap-2 border-t border-line/50 p-3">
        <button
          type="button"
          disabled={Boolean(empty)}
          onClick={async () => {
            const done = await copyText(text);
            toast(done ? "JSON copiado." : "Não foi possível copiar. Use Exportar.", done ? "ok" : "error");
          }}
          className="flex flex-1 items-center justify-center gap-2 rounded-full bg-sunken py-2 text-label text-ink hover:bg-page disabled:opacity-50"
        >
          <Copy className="size-4" /> Copiar
        </button>
        <button type="button" disabled={Boolean(empty)} onClick={() => downloadText(`${fileBase}.json`, text, "application/json")} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-sunken py-2 text-label text-ink hover:bg-page disabled:opacity-50">
          <Download className="size-4" /> Exportar .json
        </button>
      </div>
    </div>
  );
}

/** Forma pública e estável dos campos extraídos (sem detalhes internos). */
export function fieldsJson(values: { key: string; label: string; type: string; value: string | null; amount?: number; currency?: string; start?: string; end?: string; confidence: number; source: string; evidence: { page: number; text: string } | null; items?: { value: string; evidence: { page: number } }[] }[]) {
  return values.map((f) => ({
    campo: f.key,
    rotulo: f.label,
    tipo: f.type,
    valor: f.value,
    ...(f.amount !== undefined ? { numero: f.amount } : {}),
    ...(f.currency ? { moeda: f.currency } : {}),
    ...(f.start ? { inicio: f.start } : {}),
    ...(f.end ? { fim: f.end } : {}),
    confianca: f.confidence,
    origem: f.source,
    evidencia: f.evidence ? { pagina: f.evidence.page, trecho: f.evidence.text } : null,
    ...(f.items ? { itens: f.items.map((i) => ({ valor: i.value, pagina: i.evidence.page })) } : {}),
  }));
}

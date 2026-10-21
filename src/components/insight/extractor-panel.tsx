"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, CircleCheck, ExternalLink, FileText, Pencil, Settings2, Tag, X } from "lucide-react";
import { correctField, runExtraction } from "@/app/actions/extract";
import type { ExtractionView, ExtractorView } from "@/lib/extract/server";
import { NOT_IDENTIFIED, type FieldResult } from "@/lib/extract/types";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { DocTabs, PanelHeader, pct, SourceChip, type LocateTarget } from "./shared";

export interface PanelDoc {
  versionId: string;
  title: string;
  label: string;
}

const SOURCE_LABEL: Record<FieldResult["source"], string> = { rule: "Regra", ai: "IA verificada", manual: "Manual" };

/** Painel Extrator (referência 07): escolha do extrator, cards de campo e botão EXTRAIR. */
export function ExtractorPanel({
  docs,
  extractors,
  initial,
  canRun,
  onLocate,
  onResult,
}: {
  docs: PanelDoc[];
  extractors: ExtractorView[];
  initial: ExtractionView[];
  canRun: boolean;
  onLocate: (t: LocateTarget) => void;
  onResult?: (v: ExtractionView) => void;
}) {
  const [extractorId, setExtractorId] = useState(() => initial[0]?.extractorId ?? extractors[0]?.id ?? "");
  const [side, setSide] = useState(docs.length - 1);
  const [results, setResults] = useState<Record<string, ExtractionView>>(() => Object.fromEntries(initial.map((r) => [`${r.versionId}:${r.extractorId}`, r])));
  const [pending, start] = useTransition();
  const doc = docs[side]!;
  const result = results[`${doc.versionId}:${extractorId}`];

  const run = () =>
    start(async () => {
      const res = await runExtraction(doc.versionId, extractorId);
      if (!res.ok) return toast(res.error, "error");
      setResults((r) => ({ ...r, [`${doc.versionId}:${extractorId}`]: res.data! }));
      onResult?.(res.data!);
      const found = res.data!.values.filter((v) => v.value !== null).length;
      toast(`${found} de ${res.data!.values.length} campos identificados.`);
    });

  const updateField = (f: FieldResult) =>
    setResults((r) => (result ? { ...r, [`${doc.versionId}:${extractorId}`]: { ...result, values: result.values.map((x) => (x.key === f.key ? f : x)) } } : r));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader icon={ExternalLink} title="Extrator">
        <Link href="/extratores" title="Gerenciar extratores" aria-label="Gerenciar extratores" className="rounded-full p-1 text-ink-muted hover:text-ink">
          <Settings2 className="size-4" />
        </Link>
      </PanelHeader>
      <DocTabs docs={docs} active={side} onChange={setSide} />
      <div className="px-5">
        <label htmlFor="extractor" className="sr-only">
          Selecione extrator
        </label>
        <select id="extractor" value={extractorId} onChange={(e) => setExtractorId(e.target.value)} className="h-10 w-full rounded-sm bg-sunken px-3 text-body-sm text-ink focus:outline-none focus:ring-1 focus:ring-brand">
          {extractors.length === 0 && <option value="">Nenhum extrator ativo</option>}
          {extractors.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-3" aria-live="polite">
        {!result ? (
          <p className="px-2 py-10 text-center text-body-sm text-ink-muted">{pending ? "Extraindo…" : `Escolha um extrator e clique em EXTRAIR para ler ${doc.label.toLowerCase()}.`}</p>
        ) : (
          <>
            {result.note && <p className="mx-2 mb-2 rounded-sm bg-page px-3 py-2 text-label text-ink-muted">{result.note}</p>}
            <ul className="flex flex-col gap-2 pb-3">
              {result.values.map((f) => (
                <FieldCard key={f.key} field={f} resultId={result.id} versionId={doc.versionId} canEdit={canRun} onLocate={onLocate} onChange={updateField} />
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="border-t border-line/50 p-4">
        <Button onClick={run} loading={pending} disabled={!canRun || !extractorId} className="w-full" title={canRun ? undefined : "Seu perfil não permite extrair"}>
          <ExternalLink className="size-4" strokeWidth={1.5} /> {result ? "Extrair de novo" : "Extrair"}
        </Button>
      </div>
    </div>
  );
}

function FieldCard({
  field: f,
  resultId,
  versionId,
  canEdit,
  onLocate,
  onChange,
}: {
  field: FieldResult;
  resultId: string;
  versionId: string;
  canEdit: boolean;
  onLocate: (t: LocateTarget) => void;
  onChange: (f: FieldResult) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(f.value ?? "");
  const [pending, start] = useTransition();
  const save = (value: string | null) =>
    start(async () => {
      const res = await correctField(resultId, f.key, value);
      if (!res.ok) return toast(res.error, "error");
      onChange(res.data!);
      setEditing(false);
      toast(res.message ?? "Salvo.");
    });
  const locate = (e: NonNullable<FieldResult["evidence"]>) => onLocate({ versionId, page: e.page, rects: e.rects, from: e.from, to: e.to });
  const missing = f.value === null;

  return (
    <li className="lift rounded-md bg-sunken px-4 py-3">
      <div className="flex items-center gap-2 text-body-sm text-ink-muted">
        <Tag className="size-3.5 shrink-0" strokeWidth={1.5} />
        <span className="min-w-0 flex-1 truncate">{f.label}</span>
        {canEdit && !editing && (
          <button type="button" onClick={() => (setDraft(f.value ?? ""), setEditing(true))} aria-label={`Corrigir ${f.label}`} title="Corrigir" className="rounded-full p-0.5 hover:text-ink">
            <Pencil className="size-3.5" />
          </button>
        )}
      </div>

      {editing ? (
        <form
          className="mt-2 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save(draft.trim() || null);
          }}
        >
          <label htmlFor={`fv-${f.key}`} className="sr-only">
            Valor de {f.label}
          </label>
          <textarea id={`fv-${f.key}`} value={draft} onChange={(e) => setDraft(e.target.value)} rows={f.type === "list" ? 4 : 2} maxLength={1000} className="rounded-sm bg-page px-2 py-1.5 text-body-sm text-ink focus:outline-none focus:ring-1 focus:ring-brand" />
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => save(null)} disabled={pending} className="mr-auto text-label text-ink-muted hover:text-ink">
              Marcar como não identificado
            </button>
            <button type="button" onClick={() => setEditing(false)} aria-label="Cancelar" className="rounded-full p-1 text-ink-muted hover:text-ink">
              <X className="size-4" />
            </button>
            <button type="submit" disabled={pending} className="rounded-full bg-brand px-3 py-1 text-label font-semibold text-on-light disabled:opacity-50">
              Salvar
            </button>
          </div>
        </form>
      ) : f.items?.length ? (
        <ul className="mt-2 flex flex-col gap-2">
          {f.items.slice(0, 8).map((it, i) => (
            <li key={i} className="flex items-start gap-2 text-body-sm text-ink">
              <FileText className="mt-0.5 size-3.5 shrink-0 text-ink-muted" strokeWidth={1.5} />
              <span className="min-w-0 flex-1">
                <span className="line-clamp-3">{it.value}</span>
                <SourceChip page={it.evidence.page} onClick={() => locate(it.evidence)} className="mt-1" />
              </span>
            </li>
          ))}
          {f.items.length > 8 && <li className="text-label text-ink-subtle">+ {f.items.length - 8} itens</li>}
        </ul>
      ) : (
        <p className={cn("mt-2 flex items-start gap-2 text-body-sm", missing ? "text-ink-subtle" : "text-ink")}>
          <FileText className="mt-0.5 size-3.5 shrink-0 text-ink-muted" strokeWidth={1.5} />
          <span className="min-w-0 whitespace-pre-line break-words">{missing ? NOT_IDENTIFIED : f.value}</span>
        </p>
      )}

      {!editing && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-label">
          {!missing && (
            <span className={cn("flex items-center gap-1", f.confidence >= 0.85 ? "text-inserted" : "text-brand")} title="Confiança">
              <CircleCheck className="size-3.5" strokeWidth={1.75} /> {pct(f.confidence)}
            </span>
          )}
          <span className="rounded-full bg-page px-1.5 text-[10px] text-ink-muted" title={f.correctedBy ? `Corrigido por ${f.correctedBy}` : undefined}>
            {SOURCE_LABEL[f.source]}
          </span>
          {f.evidence && !f.items?.length && <SourceChip page={f.evidence.page} onClick={() => locate(f.evidence!)} />}
          {canEdit && !missing && f.source !== "manual" && (
            <button type="button" onClick={() => save(f.value)} disabled={pending} title="Validar valor" aria-label={`Validar ${f.label}`} className="ml-auto flex items-center gap-1 rounded-full px-1.5 text-ink-muted hover:text-ink">
              <Check className="size-3.5" /> Validar
            </button>
          )}
        </div>
      )}
      {f.original && f.source === "manual" && !editing && (
        <p className="mt-1 text-[10px] text-ink-subtle">
          Antes: {f.original.value ?? NOT_IDENTIFIED} ({SOURCE_LABEL[f.original.source]})
        </p>
      )}
    </li>
  );
}

"use client";

import { useEffect, useState, useTransition } from "react";
import { FileText, Loader2, RefreshCw } from "lucide-react";
import { getComparisonDashboard, type DashboardData } from "@/app/actions/extract";
import type { ExtractorView } from "@/lib/extract/server";
import { FIELD_STATUS_LABEL, type FieldDiff } from "@/lib/extract/compare";
import { NOT_IDENTIFIED, type FieldResult } from "@/lib/extract/types";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { SourceChip, type LocateTarget } from "./shared";

const fmtPct = (n: number, signed = false) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2, ...(signed ? { signDisplay: "always" } : {}) })}%`;

/** Dashboard de comparação (referência 09): campos extraídos dos dois documentos, lado a lado. */
export function DashboardDialog({
  open,
  onClose,
  comparisonId,
  extractors,
  titles,
  onLocate,
}: {
  open: boolean;
  onClose: () => void;
  comparisonId: string;
  extractors: ExtractorView[];
  titles: { base: string; revised: string };
  onLocate: (t: LocateTarget) => void;
}) {
  const [extractorId, setExtractorId] = useState(extractors[0]?.id ?? "");
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [pending, start] = useTransition();

  const load = (refresh = false) =>
    start(async () => {
      setError(null);
      const res = await getComparisonDashboard(comparisonId, extractorId, refresh);
      if (res.ok) setData(res.data!);
      else setError(res.error);
    });

  useEffect(() => {
    if (open && extractorId && data?.extractorId !== extractorId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, extractorId]);

  const fields = (data?.diff.fields ?? []).filter((f) => !onlyDiff || f.status !== "equal");
  const c = data?.diff.counts;

  return (
    <Dialog open={open} onClose={onClose} title="Dashboard de comparação" className="w-[min(1100px,calc(100vw-32px))]">
      <div className="-mt-2 flex flex-wrap items-center gap-3">
        <label htmlFor="dash-extractor" className="sr-only">
          Extrator
        </label>
        <select id="dash-extractor" value={extractorId} onChange={(e) => setExtractorId(e.target.value)} className="h-9 rounded-sm bg-sunken px-3 text-body-sm text-ink focus:outline-none focus:ring-1 focus:ring-brand">
          {extractors.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        {c && (
          <ul className="flex flex-wrap gap-2 text-label">
            <li className="rounded-full bg-sunken px-2.5 py-1 text-ink-muted">
              Iguais <b className="text-ink">{c.equal}</b>
            </li>
            <li className="rounded-full bg-sunken px-2.5 py-1 text-ink-muted">
              Alterados <b className="text-brand">{c.changed + c.added + c.removed}</b>
            </li>
            <li className="rounded-full bg-sunken px-2.5 py-1 text-ink-muted">
              Não identificados <b className="text-ink">{c.missing}</b>
            </li>
            <li className="rounded-full bg-brand/90 px-2.5 py-1 font-semibold text-on-light">Divergências relevantes {data!.diff.relevant}</li>
          </ul>
        )}
        <label className="ml-auto flex items-center gap-2 text-label text-ink-muted">
          <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} className="size-4 accent-[var(--color-brand)]" /> Só diferenças
        </label>
        <button type="button" onClick={() => load(true)} disabled={pending} className="flex items-center gap-1.5 rounded-full px-2 py-1 text-label text-ink-muted hover:text-ink disabled:opacity-50" title="Extrair os dois documentos de novo">
          <RefreshCw className={cn("size-3.5", pending && "animate-spin")} /> Atualizar
        </button>
      </div>

      {error && <p className="rounded-sm bg-removed/15 px-3 py-2 text-body-sm text-[#f0a3a2]">{error}</p>}
      {!data && !error && (
        <p className="flex items-center justify-center gap-2 py-16 text-body-sm text-ink-muted">
          <Loader2 className="size-4 animate-spin" /> Extraindo os campos dos dois documentos…
        </p>
      )}

      {data && (
        <div className="max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-1 gap-x-10 md:grid-cols-2 md:divide-x md:divide-line/60">
            {(["base", "revised"] as const).map((side) => (
              <section key={side} className={cn("min-w-0", side === "revised" && "md:pl-10")} aria-label={side === "base" ? "Documento original" : "Documento revisado"}>
                <h3 className="flex items-center gap-2 border-b border-line/60 pb-3 text-body">
                  <FileText className="size-5 shrink-0 text-ink-muted" strokeWidth={1.4} />
                  <span className="truncate">{side === "base" ? titles.base : titles.revised}</span>
                  <span className="ml-auto shrink-0 text-label text-ink-subtle">{side === "base" ? "Original" : "Revisado"}</span>
                </h3>
                <dl>
                  {fields.map((f) => (
                    <Row key={f.key} diff={f} side={side} versionId={side === "base" ? data.base.versionId : data.revised.versionId} onLocate={onLocate} />
                  ))}
                </dl>
              </section>
            ))}
          </div>
          {fields.length === 0 && <p className="py-10 text-center text-body-sm text-ink-muted">Nenhuma diferença nos campos extraídos.</p>}
          <p className="mt-4 text-label text-ink-subtle">Valores extraídos dos próprios documentos (regras{data.base.model || data.revised.model ? " e IA com trecho verificado" : ""}). Campos sem evidência aparecem como “{NOT_IDENTIFIED}”.</p>
        </div>
      )}
    </Dialog>
  );
}

function Row({ diff, side, versionId, onLocate }: { diff: FieldDiff; side: "base" | "revised"; versionId: string; onLocate: (t: LocateTarget) => void }) {
  const f = diff[side];
  const other = diff[side === "base" ? "revised" : "base"];
  const changed = diff.status !== "equal" && diff.status !== "missing";
  const value = f?.value ?? null;
  const tone = !changed || !value ? "text-ink" : side === "base" ? "text-[#f0807e]" : "text-inserted";
  const label = `${diff.label}${diff.type === "money" && (f?.currency ?? other?.currency) ? ` (${f?.currency ?? other?.currency})` : ""}`;
  const locate = f?.evidence ? () => onLocate({ versionId, page: f.evidence!.page, rects: f.evidence!.rects, from: f.evidence!.from, to: f.evidence!.to }) : undefined;

  const head = (
    <dt className="flex items-center gap-2 text-label text-ink-muted">
      <span>{label}:</span>
      {side === "revised" && changed && (
        <span className={cn("rounded-full px-1.5 text-[10px] font-semibold", diff.relevant ? "bg-brand text-on-light" : "bg-sunken text-ink-muted")}>{diff.relevant ? "Relevante" : FIELD_STATUS_LABEL[diff.status]}</span>
      )}
    </dt>
  );

  if (diff.type === "money" && value && f?.amount !== undefined) {
    const max = Math.max(f.amount, other?.amount ?? 0) || 1;
    const ratio = f.amount / max;
    return (
      <div className="border-b border-line/60 py-3">
        {head}
        <dd className="mt-3">
          <div className="flex items-baseline justify-between text-label text-ink-muted">
            <span className="tabular-nums">{fmtPct(Math.round(ratio * 10000) / 100)}</span>
            <span className={cn("text-body tabular-nums", tone)}>{value}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken" role="img" aria-label={`${label}: ${value}, ${fmtPct(Math.round(ratio * 100))} do maior valor`}>
            <span className={cn("block h-full rounded-full", side === "revised" && changed ? "bg-inserted" : "bg-[#d5dd5c]")} style={{ width: `${Math.max(2, ratio * 100)}%` }} />
          </div>
          <Meta field={f} diff={side === "revised" ? diff : undefined} onLocate={locate} />
        </dd>
      </div>
    );
  }

  if (diff.type === "percent" && value && f?.amount !== undefined) {
    return (
      <div className="border-b border-line/60 py-3">
        {head}
        <dd className="mt-2 flex flex-col items-center">
          <Donut value={f.amount} label={value} highlight={side === "revised" && changed} />
          <Meta field={f} diff={side === "revised" ? diff : undefined} onLocate={locate} />
        </dd>
      </div>
    );
  }

  return (
    <div className="border-b border-line/60 py-3">
      <div className="flex items-start justify-between gap-4">
        {head}
        <dd className={cn("min-w-0 text-right text-body", value ? tone : "text-ink-subtle")}>
          {diff.type === "list" && f?.items?.length ? `${f.items.length} ${f.items.length === 1 ? "item" : "itens"}` : (value ?? NOT_IDENTIFIED)}
        </dd>
      </div>
      {value && <Meta field={f!} diff={side === "revised" ? diff : undefined} onLocate={locate} />}
    </div>
  );
}

function Meta({ field, diff, onLocate }: { field: FieldResult; diff?: FieldDiff; onLocate?: () => void }) {
  return (
    <div className="mt-1.5 flex flex-wrap items-center justify-end gap-2 text-[11px] text-ink-subtle">
      {diff?.variation !== undefined && <span className={cn("tabular-nums", diff.variation > 0 ? "text-inserted" : "text-[#f0807e]")}>{fmtPct(diff.variation, true)} vs original</span>}
      {diff?.daysDelta !== undefined && diff.daysDelta !== 0 && <span className="tabular-nums">{diff.daysDelta > 0 ? `+${diff.daysDelta}` : diff.daysDelta} dias</span>}
      {field.source === "manual" && <span>corrigido</span>}
      {field.source === "ai" && <span>IA verificada</span>}
      {onLocate && field.evidence && <SourceChip page={field.evidence.page} onClick={onLocate} />}
    </div>
  );
}

function Donut({ value, label, highlight }: { value: number; label: string; highlight: boolean }) {
  const r = 52;
  const len = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <svg viewBox="0 0 140 140" className="size-40" role="img" aria-label={label}>
      <circle cx="70" cy="70" r={r} fill="none" stroke="var(--color-sunken)" strokeWidth="12" />
      <circle cx="70" cy="70" r={r} fill="none" stroke={highlight ? "var(--color-inserted)" : "var(--color-chart)"} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${(v / 100) * len} ${len}`} transform="rotate(-90 70 70)" />
      <text x="70" y="76" textAnchor="middle" className="fill-ink text-[20px]" style={{ fontSize: 20 }}>
        {label}
      </text>
    </svg>
  );
}

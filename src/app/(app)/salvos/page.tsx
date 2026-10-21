import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftRight, ExternalLink, MessageSquare } from "lucide-react";
import { documentVisibleWhere, getCtx } from "@/lib/access";
import { db } from "@/lib/db";
import { UnavailableState } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import type { CompareMetrics } from "@/lib/compare/types";
import type { FieldResult } from "@/lib/extract/types";

export const metadata: Metadata = { title: "Salvos" };

const vs = (n: number) => `vs${String(n).padStart(2, "0")}`;

/** Tudo o que o Docxy guarda automaticamente: comparações, extrações e conversas do usuário. */
export default async function SavedPage() {
  const ctx = await getCtx();
  const visible = documentVisibleWhere(ctx);
  const versionSel = { select: { id: true, versionNumber: true, documentId: true, document: { select: { title: true } } } } as const;
  const [comparisons, extractions, conversations] = await Promise.all([
    db.comparison.findMany({
      where: { organizationId: ctx.orgId, status: "DONE", baseVersion: { document: { AND: [visible, { deletedAt: null }] } }, revisedVersion: { document: { AND: [visible, { deletedAt: null }] } } },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, createdAt: true, metrics: true, baseVersion: versionSel, revisedVersion: versionSel },
    }),
    db.extractionResult.findMany({
      where: { status: "DONE", version: { document: { AND: [visible, { deletedAt: null }] } } },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, createdAt: true, values: true, model: true, extractor: { select: { name: true } }, version: versionSel },
    }),
    db.aIConversation.findMany({ where: { organizationId: ctx.orgId, userId: ctx.userId }, orderBy: { updatedAt: "desc" }, take: 20, select: { id: true, title: true, updatedAt: true, comparisonId: true, versionIds: true, _count: { select: { messages: true } } } }),
  ]);
  const convVersions = await db.documentVersion.findMany({ where: { id: { in: conversations.flatMap((c) => c.versionIds) }, document: visible }, ...versionSel });
  const byVersion = new Map(convVersions.map((v) => [v.id, v]));

  const empty = comparisons.length + extractions.length + conversations.length === 0;
  return (
    <section className="flex flex-1 flex-col gap-8 rounded-lg bg-surface p-6 lg:px-12">
      <div>
        <h1 className="text-title font-semibold">Salvos</h1>
        <p className="mt-1 max-w-2xl text-body-sm text-ink-muted">Comparações, extrações e conversas são guardadas automaticamente e ficam aqui para reabrir. Só aparece o que você ainda tem permissão para ver.</p>
      </div>
      {empty && <UnavailableState className="min-h-64" title="Nada salvo ainda" description="Compare versões, extraia dados ou converse com o assistente a partir de um documento." />}

      {comparisons.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-body font-semibold">
            <ArrowLeftRight className="size-5 text-ink-muted" strokeWidth={1.5} /> Comparações
          </h2>
          <ul className="rows-hover divide-y divide-line/50">
            {comparisons.map((c) => (
              <li key={c.id}>
                <Link href={`/comparar/${c.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-2 py-3">
                  <span className="min-w-0 flex-1 truncate text-body">
                    {c.baseVersion.document.title} ({vs(c.baseVersion.versionNumber)}) × {c.revisedVersion.document.title} ({vs(c.revisedVersion.versionNumber)})
                  </span>
                  <span className="text-body-sm tabular-nums text-accent-strong">{(c.metrics as unknown as CompareMetrics | null)?.differencePercent?.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) ?? "—"}% de diferença</span>
                  <span className="text-body-sm text-ink-muted">{formatDate(c.createdAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {extractions.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-body font-semibold">
            <ExternalLink className="size-5 text-ink-muted" strokeWidth={1.5} /> Extrações
          </h2>
          <ul className="rows-hover divide-y divide-line/50">
            {extractions.map((x) => {
              const values = (x.values as unknown as FieldResult[] | null) ?? [];
              return (
                <li key={x.id}>
                  <Link href={`/documentos/${x.version.documentId}/ver?v=${x.version.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-2 py-3">
                    <span className="min-w-0 flex-1 truncate text-body">
                      {x.version.document.title} ({vs(x.version.versionNumber)})
                    </span>
                    <span className="text-body-sm text-ink-muted">{x.extractor.name}</span>
                    <span className="text-body-sm tabular-nums text-accent-strong">
                      {values.filter((v) => v.value !== null).length}/{values.length} campos
                    </span>
                    {x.model && <span className="rounded-full bg-sunken px-2 text-[11px] text-ink-muted">IA</span>}
                    <span className="text-body-sm text-ink-muted">{formatDate(x.createdAt)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {conversations.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-body font-semibold">
            <MessageSquare className="size-5 text-ink-muted" strokeWidth={1.5} /> Suas conversas com o assistente
          </h2>
          <ul className="rows-hover divide-y divide-line/50">
            {conversations.map((c) => {
              const v = byVersion.get(c.versionIds[0] ?? "");
              if (!v) return null;
              const href = c.comparisonId ? `/comparar/${c.comparisonId}` : `/documentos/${v.documentId}/ver?v=${v.id}`;
              return (
                <li key={c.id}>
                  <Link href={href} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-2 py-3">
                    <span className="min-w-0 flex-1 truncate text-body">{c.title ?? "Conversa"}</span>
                    <span className="text-body-sm text-ink-muted">
                      {v.document.title}
                      {c.comparisonId ? " · comparação" : ""}
                    </span>
                    <span className="text-body-sm tabular-nums text-ink-muted">{c._count.messages} mensagens</span>
                    <span className="text-body-sm text-ink-muted">{formatDate(c.updatedAt)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

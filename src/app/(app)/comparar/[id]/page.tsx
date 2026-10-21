import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCtx, requireDocument } from "@/lib/access";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { getVersionOptions, getViewerDoc } from "@/lib/queries/compare";
import { getExtractors, getLatestExtractions } from "@/lib/extract/server";
import type { CompareMetrics, ChangeType } from "@/lib/compare/types";
import { CompareApp, type ChangeItem, type ChangeSideData } from "@/components/compare/compare-app";
import { UnavailableState } from "@/components/ui/card";

export const metadata: Metadata = { title: "Comparação" };

export default async function ComparisonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getCtx();
  const comparison = await db.comparison.findFirst({
    where: { id, organizationId: ctx.orgId },
    include: { baseVersion: { select: { documentId: true } }, revisedVersion: { select: { documentId: true } } },
  });
  if (!comparison) notFound();

  let role;
  try {
    await requireDocument(ctx, comparison.baseVersion.documentId, "document.read");
    role = (await requireDocument(ctx, comparison.revisedVersion.documentId, "document.read")).role;
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  if (comparison.status !== "DONE" || !comparison.metrics) {
    return (
      <UnavailableState
        className="min-h-64"
        title={comparison.status === "FAILED" ? "A comparação falhou" : "Comparação em andamento"}
        description={comparison.status === "FAILED" ? (comparison.error ?? "Tente comparar de novo.") : "Atualize a página em instantes."}
      />
    );
  }

  const [base, revised, rows, options, extractors, exBase, exRevised] = await Promise.all([
    getViewerDoc(ctx, comparison.baseVersionId),
    getViewerDoc(ctx, comparison.revisedVersionId),
    db.comparisonChange.findMany({
      where: { comparisonId: comparison.id },
      orderBy: { position: "asc" },
      include: { comments: { where: { deletedAt: null }, orderBy: { createdAt: "asc" }, include: { author: { select: { name: true, email: true } } } } },
    }),
    getVersionOptions(ctx, comparison.revisedVersion.documentId),
    getExtractors(ctx),
    getLatestExtractions(comparison.baseVersionId),
    getLatestExtractions(comparison.revisedVersionId),
  ]);
  if (!base || !revised) notFound();

  const side = (v: unknown): ChangeSideData | null => (v && typeof v === "object" ? (v as ChangeSideData) : null);
  const changes: ChangeItem[] = rows.map((r) => ({
    id: r.id,
    position: r.position,
    type: r.type as ChangeType,
    relevant: r.relevant,
    baseText: r.baseText,
    revisedText: r.revisedText,
    basePage: r.basePage,
    revisedPage: r.revisedPage,
    base: side(r.baseRects),
    revised: side(r.revisedRects),
    contextBefore: r.contextBefore,
    contextAfter: r.contextAfter,
    reviewStatus: r.reviewStatus,
    comments: r.comments.map((c) => ({ id: c.id, author: c.author.name ?? c.author.email, body: c.body, createdAt: c.createdAt.toISOString() })),
  }));

  return (
    <CompareApp
      comparisonId={comparison.id}
      base={base}
      revised={revised}
      changes={changes}
      metrics={comparison.metrics as unknown as CompareMetrics}
      options={options}
      canReview={can(role, "comparison.review")}
      canComment={can(role, "comment.write")}
      extractors={extractors}
      extractions={[...exBase, ...exRevised]}
      canExtract={can(role, "extraction.run")}
      canAsk={can(role, "ai.ask")}
    />
  );
}

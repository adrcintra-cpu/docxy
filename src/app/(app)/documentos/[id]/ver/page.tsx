import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCtx, requireDocument } from "@/lib/access";
import { can } from "@/lib/auth/permissions";
import { getExtractors, getLatestExtractions } from "@/lib/extract/server";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { getVersionOptions, getViewerDoc } from "@/lib/queries/compare";
import { touchRecent } from "@/lib/queries/library";
import { ViewerApp } from "@/components/viewer/viewer-app";
import { UnavailableState } from "@/components/ui/card";

export const metadata: Metadata = { title: "Visualizador" };

const vs = (n: number) => `vs${String(n).padStart(2, "0")}`;

export default async function ViewerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string }> }) {
  const { id } = await params;
  const { v } = await searchParams;
  const ctx = await getCtx();
  let document;
  let role;
  try {
    ({ document, role } = await requireDocument(ctx, id, "document.read"));
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  const versions = await db.documentVersion.findMany({
    where: { documentId: document.id, stage: { not: "UPLOADING" } },
    orderBy: { versionNumber: "desc" },
    select: { id: true, versionNumber: true, stage: true, hasText: true, processingError: true },
  });
  const selected = versions.find((x) => x.id === v) ?? versions.find((x) => x.id === document.currentVersionId) ?? versions[0];
  if (!selected) return <UnavailableState className="min-h-64" title="Este documento ainda não tem versão publicada" />;

  const [doc, options, extractors, extractions] = await Promise.all([
    getViewerDoc(ctx, selected.id),
    getVersionOptions(ctx, document.id),
    getExtractors(ctx),
    getLatestExtractions(selected.id),
    touchRecent(ctx.userId, { documentId: document.id }),
  ]);
  if (!doc) notFound();

  const note =
    selected.stage === "FAILED"
      ? `Não foi possível ler o texto desta versão: ${selected.processingError ?? "erro"}. A visualização funciona, mas pesquisa e comparação não.`
      : selected.stage !== "DONE"
        ? "Lendo o texto desta versão… A visualização já funciona; pesquisa e comparação ficam disponíveis em instantes."
        : !selected.hasText
          ? (selected.processingError ?? "Documento sem texto extraível.")
          : (selected.processingError ?? undefined);

  return (
    <ViewerApp
      doc={doc}
      options={options}
      processingNote={note}
      ready={selected.stage === "DONE" && Boolean(selected.hasText)}
      extractors={extractors}
      extractions={extractions}
      canExtract={can(role, "extraction.run")}
      canAsk={can(role, "ai.ask")}
      versions={versions.map((x) => ({ id: x.id, label: vs(x.versionNumber), current: x.id === document.currentVersionId }))}
    />
  );
}

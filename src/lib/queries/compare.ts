import "server-only";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import { documentVisibleWhere, requireDocument, type Ctx } from "@/lib/access";
import { wordTokenIndex } from "@/lib/compare/engine";
import { loadPages } from "@/lib/processing/run";
import type { ViewerDoc } from "@/components/viewer/document-pane";
import type { VersionOption } from "@/components/compare/compare-dialog";

const vs = (n: number) => `vs${String(n).padStart(2, "0")}`;

function notReady(v: { stage: string; hasText: boolean | null }) {
  if (v.stage === "FAILED") return "falhou a leitura";
  if (v.stage !== "DONE") return "ainda lendo";
  if (!v.hasText) return "sem texto";
  return undefined;
}

/** Opções para "Comparar": versões deste documento + versão atual de outros documentos visíveis. */
export async function getVersionOptions(ctx: Ctx, documentId: string): Promise<VersionOption[]> {
  const [own, others] = await Promise.all([
    db.documentVersion.findMany({
      where: { documentId, stage: { not: "UPLOADING" } },
      orderBy: { versionNumber: "desc" },
      select: { id: true, versionNumber: true, fileName: true, stage: true, hasText: true, document: { select: { title: true } } },
    }),
    db.document.findMany({
      where: { AND: [documentVisibleWhere(ctx), { deletedAt: null, id: { not: documentId }, currentVersionId: { not: null } }] },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: { title: true, currentVersion: { select: { id: true, versionNumber: true, stage: true, hasText: true } } },
    }),
  ]);
  return [
    ...own.map((v) => ({ id: v.id, label: `${vs(v.versionNumber)} · ${v.fileName}`, group: own[0]?.document.title ?? "Este documento", notReady: notReady(v) })),
    ...others
      .filter((d) => d.currentVersion)
      .map((d) => ({ id: d.currentVersion!.id, label: `${d.title} (${vs(d.currentVersion!.versionNumber)})`, group: "Outros documentos", notReady: notReady(d.currentVersion!) })),
  ];
}

/** Dados do visualizador para uma versão já lida. */
export async function getViewerDoc(ctx: Ctx, versionId: string): Promise<ViewerDoc | null> {
  const version = await db.documentVersion.findFirst({
    where: { id: versionId, stage: { notIn: ["UPLOADING"] }, document: { organizationId: ctx.orgId } },
    select: { id: true, documentId: true, fileName: true, versionNumber: true, mimeType: true, pageCount: true, document: { select: { title: true } } },
  });
  if (!version) return null;
  const { role } = await requireDocument(ctx, version.documentId, "document.read");
  const pages = await loadPages(version.id);
  return {
    versionId: version.id,
    documentId: version.documentId,
    title: version.document.title,
    fileName: version.fileName,
    versionNumber: version.versionNumber,
    kind: version.mimeType === "application/pdf" ? "pdf" : "docx",
    // Antes da leitura terminar, o PDF aparece com páginas A4 provisórias (sem texto para pesquisa).
    pages: pages.length
      ? pages
      : Array.from({ length: Math.max(1, version.pageCount ?? 1) }, (_, i) => ({ page: i + 1, width: 595, height: 842, words: [] })),
    tokenIndex: wordTokenIndex(pages),
    canDownload: can(role, "document.download"),
  };
}

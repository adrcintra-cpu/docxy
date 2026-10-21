import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { readObject } from "@/lib/storage";
import type { PageText } from "@/lib/compare/types";
import { extractPdf } from "./pdf";
import { extractDocx } from "./docx";
import { OCR_ENABLED, ocrPdfPages } from "./ocr";

/** Tempo após o qual um processamento parado volta para a fila. */
const STUCK_AFTER_MS = 15 * 60 * 1000;

/**
 * Processa uma versão: extrai o texto (PDF.js / DOCX), faz OCR das páginas sem texto
 * quando habilitado, grava as páginas e marca a versão como pronta.
 * Idempotente e seguro para chamadas concorrentes (a versão é "reservada" antes).
 */
export async function processVersion(versionId: string): Promise<"done" | "skipped" | "failed"> {
  const claimed = await db.documentVersion.updateMany({
    where: { id: versionId, stage: "QUEUED" },
    data: { stage: "EXTRACTING_TEXT", processingStartedAt: new Date(), processingError: null },
  });
  if (claimed.count === 0) return "skipped";

  const version = await db.documentVersion.findUniqueOrThrow({
    where: { id: versionId },
    include: { document: { select: { id: true, title: true, organizationId: true } } },
  });

  try {
    const bytes = await readObject(version.storagePath);
    if (!bytes) throw new Error("arquivo não encontrado no armazenamento");
    const isPdf = version.mimeType === "application/pdf";

    let pages: PageText[] = isPdf ? await extractPdf(bytes) : await extractDocx(bytes);

    const empty = pages.filter((p) => p.words.length === 0).map((p) => p.page);
    if (isPdf && empty.length > 0 && OCR_ENABLED) {
      await db.documentVersion.update({ where: { id: versionId }, data: { stage: "OCR" } });
      const ocr = await ocrPdfPages(bytes, empty);
      pages = pages.map((p) => (ocr.has(p.page) ? { ...p, words: ocr.get(p.page)!, ocr: true } : p));
    }

    await db.documentVersion.update({ where: { id: versionId }, data: { stage: "INDEXING" } });
    await db.$transaction([
      db.versionPage.deleteMany({ where: { versionId } }),
      db.versionPage.createMany({
        data: pages.map((p) => ({
          versionId,
          pageNumber: p.page,
          width: p.width,
          height: p.height,
          text: p.words.map((w) => w.t).join(" "),
          words: p.words as unknown as Prisma.InputJsonValue,
          ocr: Boolean(p.ocr),
        })),
      }),
    ]);

    const hasText = pages.some((p) => p.words.length > 0);
    const pagesWithoutText = pages.filter((p) => p.words.length === 0).length;
    await db.documentVersion.update({
      where: { id: versionId },
      data: {
        stage: "DONE",
        pageCount: isPdf ? pages.length : version.pageCount,
        hasText,
        processingError: !hasText
          ? OCR_ENABLED
            ? "Nenhum texto reconhecido, nem por OCR."
            : "Documento sem texto extraível (provavelmente digitalizado). Ative o OCR para lê-lo."
          : pagesWithoutText > 0
            ? `${pagesWithoutText} página(s) sem texto extraível.`
            : null,
      },
    });

    await audit({ event: "document.processed", result: "SUCCESS", organizationId: version.document.organizationId, documentId: version.documentId, versionId, metadata: { pages: pages.length, hasText } });
    await notify({
      organizationId: version.document.organizationId,
      userIds: [version.uploadedById],
      type: "PROCESSING_DONE",
      title: hasText ? `"${version.document.title}" está pronto para comparar` : `"${version.document.title}" não tem texto legível`,
      href: `/documentos/${version.documentId}`,
    });
    return "done";
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 300) : "erro desconhecido";
    console.error("[processing]", versionId, message);
    await db.documentVersion.update({ where: { id: versionId }, data: { stage: "FAILED", processingError: `Não foi possível ler o arquivo: ${message}` } });
    await audit({ event: "document.processed", result: "FAILURE", organizationId: version.document.organizationId, documentId: version.documentId, versionId, metadata: { reason: message } });
    await notify({
      organizationId: version.document.organizationId,
      userIds: [version.uploadedById],
      type: "PROCESSING_FAILED",
      title: `Falha ao ler "${version.document.title}"`,
      href: `/documentos/${version.documentId}`,
    });
    return "failed";
  }
}

/** Processa a fila: devolve à fila o que travou e processa até `limit` versões. Usado pelo cron. */
export async function processQueue(limit = 5) {
  await db.documentVersion.updateMany({
    where: { stage: { in: ["EXTRACTING_TEXT", "OCR", "INDEXING"] }, processingStartedAt: { lt: new Date(Date.now() - STUCK_AFTER_MS) } },
    data: { stage: "QUEUED" },
  });
  const queued = await db.documentVersion.findMany({ where: { stage: "QUEUED" }, orderBy: { createdAt: "asc" }, take: limit, select: { id: true } });
  const results: Record<string, string> = {};
  for (const v of queued) results[v.id] = await processVersion(v.id);
  return results;
}

/** Páginas de uma versão já processada, no formato do motor de comparação. */
export async function loadPages(versionId: string): Promise<PageText[]> {
  const rows = await db.versionPage.findMany({ where: { versionId }, orderBy: { pageNumber: "asc" } });
  return rows.map((r) => ({ page: r.pageNumber, width: r.width, height: r.height, words: r.words as unknown as PageText["words"], ocr: r.ocr }));
}

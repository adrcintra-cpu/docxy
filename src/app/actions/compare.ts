"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { guard, ok } from "@/lib/actions";
import { NotFoundError, UserError, type ActionResult } from "@/lib/errors";
import { getCtx, requireDocument, type Ctx } from "@/lib/access";
import { compareDocuments, ENGINE_VERSION } from "@/lib/compare/engine";
import { loadPages } from "@/lib/processing/run";

const uuid = z.string().uuid("Versão inválida.");

async function readyVersion(ctx: Ctx, versionId: string, action: "document.read" | "comparison.run") {
  const version = await db.documentVersion.findFirst({
    where: { id: uuid.parse(versionId), document: { organizationId: ctx.orgId, deletedAt: null } },
    select: { id: true, documentId: true, stage: true, hasText: true, versionNumber: true, document: { select: { title: true } } },
  });
  if (!version) throw new NotFoundError("Versão");
  await requireDocument(ctx, version.documentId, action);
  const name = `${version.document.title} (vs${String(version.versionNumber).padStart(2, "0")})`;
  if (version.stage === "FAILED") throw new UserError(`Não foi possível ler ${name}. Tente reprocessar o arquivo.`);
  if (version.stage !== "DONE") throw new UserError(`${name} ainda está sendo lido. Tente de novo em instantes.`);
  if (!version.hasText) throw new UserError(`${name} não tem texto extraível (documento digitalizado sem OCR).`);
  return version;
}

/**
 * Compara duas versões (do mesmo documento ou de documentos diferentes) e grava o resultado.
 * O mesmo par com a mesma versão do motor reaproveita a comparação já feita.
 */
export async function startComparison(baseVersionId: string, revisedVersionId: string): Promise<ActionResult<{ id: string }>> {
  return guard(async () => {
    const ctx = await getCtx();
    if (baseVersionId === revisedVersionId) throw new UserError("Escolha duas versões diferentes.");
    const [base, revised] = await Promise.all([readyVersion(ctx, baseVersionId, "document.read"), readyVersion(ctx, revisedVersionId, "comparison.run")]);

    const existing = await db.comparison.findUnique({
      where: { baseVersionId_revisedVersionId_engineVersion: { baseVersionId: base.id, revisedVersionId: revised.id, engineVersion: ENGINE_VERSION } },
      select: { id: true, status: true },
    });
    if (existing?.status === "DONE") return ok({ id: existing.id });

    const comparison = existing
      ? await db.comparison.update({ where: { id: existing.id }, data: { status: "PROCESSING", error: null } })
      : await db.comparison.create({
          data: { organizationId: ctx.orgId, baseVersionId: base.id, revisedVersionId: revised.id, engineVersion: ENGINE_VERSION, status: "PROCESSING", requestedById: ctx.userId },
        });

    try {
      const [basePages, revisedPages] = await Promise.all([loadPages(base.id), loadPages(revised.id)]);
      const result = compareDocuments(basePages, revisedPages);
      const rows: Prisma.ComparisonChangeCreateManyInput[] = result.changes.map((c) => ({
        comparisonId: comparison.id,
        position: c.position,
        type: c.type,
        relevant: c.relevant,
        baseText: c.base?.text || null,
        revisedText: c.revised?.text || null,
        basePage: c.base?.page ?? null,
        revisedPage: c.revised?.page ?? null,
        baseRects: c.base ? ({ from: c.base.from, to: c.base.to, rects: c.base.rects } as unknown as Prisma.InputJsonValue) : undefined,
        revisedRects: c.revised ? ({ from: c.revised.from, to: c.revised.to, rects: c.revised.rects } as unknown as Prisma.InputJsonValue) : undefined,
        contextBefore: c.contextBefore || null,
        contextAfter: c.contextAfter || null,
      }));
      await db.$transaction(async (tx) => {
        await tx.comparisonChange.deleteMany({ where: { comparisonId: comparison.id } });
        for (let i = 0; i < rows.length; i += 500) await tx.comparisonChange.createMany({ data: rows.slice(i, i + 500) });
        await tx.comparison.update({
          where: { id: comparison.id },
          data: { status: "DONE", metrics: result.metrics as unknown as Prisma.InputJsonValue, completedAt: new Date() },
        });
      });
      await audit({ event: "comparison.run", result: "SUCCESS", userId: ctx.userId, organizationId: ctx.orgId, documentId: revised.documentId, versionId: revised.id, metadata: { comparisonId: comparison.id, changes: rows.length } });
      return ok({ id: comparison.id });
    } catch (err) {
      await db.comparison.update({ where: { id: comparison.id }, data: { status: "FAILED", error: err instanceof Error ? err.message.slice(0, 300) : "erro" } });
      throw err;
    }
  });
}

/** Garante acesso à comparação: é preciso poder ler os dois documentos. */
async function requireComparison(ctx: Ctx, comparisonId: string) {
  const comparison = await db.comparison.findFirst({
    where: { id: uuid.parse(comparisonId), organizationId: ctx.orgId },
    include: { baseVersion: { select: { documentId: true } }, revisedVersion: { select: { documentId: true } } },
  });
  if (!comparison) throw new NotFoundError("Comparação");
  await requireDocument(ctx, comparison.baseVersion.documentId, "document.read");
  const { role } = await requireDocument(ctx, comparison.revisedVersion.documentId, "document.read");
  return { comparison, role };
}

async function requireChange(changeId: string) {
  const ctx = await getCtx();
  const change = await db.comparisonChange.findUnique({ where: { id: uuid.parse(changeId) }, select: { id: true, comparisonId: true } });
  if (!change) throw new NotFoundError("Alteração");
  const { comparison } = await requireComparison(ctx, change.comparisonId);
  return { ctx, change, comparison };
}

/** Marca uma diferença como revisada (ou volta para pendente). */
export async function setChangeReview(changeId: string, status: "PENDING" | "REVIEWED" | "DISMISSED"): Promise<ActionResult> {
  return guard(async () => {
    const { ctx, change, comparison } = await requireChange(changeId);
    await requireDocument(ctx, (await db.documentVersion.findUniqueOrThrow({ where: { id: comparison.revisedVersionId }, select: { documentId: true } })).documentId, "comparison.review");
    const next = z.enum(["PENDING", "REVIEWED", "DISMISSED"]).parse(status);
    await db.comparisonChange.update({
      where: { id: change.id },
      data: { reviewStatus: next, reviewedById: next === "PENDING" ? null : ctx.userId, reviewedAt: next === "PENDING" ? null : new Date() },
    });
    revalidatePath(`/comparar/${comparison.id}`);
    return ok();
  });
}

export async function addChangeComment(changeId: string, body: string): Promise<ActionResult<{ id: string; author: string; body: string; createdAt: string }>> {
  return guard(async () => {
    const { ctx, change, comparison } = await requireChange(changeId);
    const text = z.string().trim().min(1, "Escreva um comentário.").max(2000).parse(body);
    const revisedDoc = await db.documentVersion.findUniqueOrThrow({ where: { id: comparison.revisedVersionId }, select: { documentId: true } });
    await requireDocument(ctx, revisedDoc.documentId, "comment.write");
    const comment = await db.comment.create({ data: { authorId: ctx.userId, comparisonId: comparison.id, changeId: change.id, documentId: revisedDoc.documentId, body: text } });
    await audit({ event: "comment.create", result: "SUCCESS", userId: ctx.userId, organizationId: ctx.orgId, documentId: revisedDoc.documentId });
    return ok({ id: comment.id, author: ctx.userName, body: comment.body, createdAt: comment.createdAt.toISOString() });
  });
}

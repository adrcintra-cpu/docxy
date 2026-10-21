import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireDocument, type Ctx } from "@/lib/access";
import type { Action } from "@/lib/auth/permissions";
import { NotFoundError, UserError } from "@/lib/errors";
import { loadPages } from "@/lib/processing/run";
import type { CompareMetrics, ChangeType, Rect } from "@/lib/compare/types";
import { buildCorpus } from "@/lib/extract/corpus";
import { extractFields } from "@/lib/extract/rules";
import { EXTRACTOR_TEMPLATES } from "@/lib/extract/templates";
import type { FieldResult } from "@/lib/extract/types";
import type { ComparisonContext, SourceDoc } from "./types";

const uuid = z.string().uuid("Identificador inválido.");

/** Versão lida e acessível, pronta para extração/assistente/resumos. */
export async function loadSource(ctx: Ctx, versionId: string, action: Action, role?: "base" | "revised"): Promise<SourceDoc & { documentId: string }> {
  const v = await db.documentVersion.findFirst({
    where: { id: uuid.parse(versionId), document: { organizationId: ctx.orgId, deletedAt: null } },
    select: { id: true, documentId: true, stage: true, hasText: true, versionNumber: true, document: { select: { title: true } } },
  });
  if (!v) throw new NotFoundError("Versão");
  await requireDocument(ctx, v.documentId, action);
  const title = `${v.document.title} (vs${String(v.versionNumber).padStart(2, "0")})`;
  if (v.stage !== "DONE") throw new UserError(`${title} ainda está sendo lido. Tente em instantes.`);
  if (!v.hasText) throw new UserError(`${title} não tem texto extraível.`);
  const corpus = buildCorpus(await loadPages(v.id));
  const latest = await db.extractionResult.findFirst({ where: { versionId: v.id, status: "DONE" }, orderBy: { createdAt: "desc" }, select: { values: true } });
  const fields = (latest?.values as unknown as FieldResult[] | null) ?? extractFields(corpus, EXTRACTOR_TEMPLATES[0]!.fields);
  return { versionId: v.id, documentId: v.documentId, title, role, corpus, fields };
}

/** Comparação acessível + as alterações do motor, para o assistente e os resumos. */
export async function loadComparison(ctx: Ctx, comparisonId: string, action: Action = "ai.ask") {
  const cmp = await db.comparison.findFirst({
    where: { id: uuid.parse(comparisonId), organizationId: ctx.orgId, status: "DONE" },
    include: { changes: { orderBy: { position: "asc" } } },
  });
  if (!cmp) throw new NotFoundError("Comparação");
  const [base, revised] = await Promise.all([loadSource(ctx, cmp.baseVersionId, action, "base"), loadSource(ctx, cmp.revisedVersionId, action, "revised")]);
  const metrics = cmp.metrics as unknown as CompareMetrics;
  const side = (v: unknown) => (v && typeof v === "object" ? (v as { from: number; to: number; rects: Rect[] }) : null);
  const context: ComparisonContext = {
    differencePercent: metrics.differencePercent,
    counts: metrics.changes,
    changes: cmp.changes
      .filter((c) => c.reviewStatus !== "DISMISSED")
      .map((c) => ({
        position: c.position,
        type: c.type as ChangeType,
        relevant: c.relevant,
        baseText: c.baseText,
        revisedText: c.revisedText,
        basePage: c.basePage,
        revisedPage: c.revisedPage,
        base: side(c.baseRects),
        revised: side(c.revisedRects),
      })),
  };
  return { comparison: cmp, base, revised, context };
}

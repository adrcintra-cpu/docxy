import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { Ctx } from "@/lib/access";
import { EXTRACTOR_TEMPLATES } from "./templates";
import type { FieldDef, FieldResult } from "./types";

export interface ExtractorView {
  id: string;
  name: string;
  documentKind: string;
  description: string | null;
  template: string | null;
  active: boolean;
  fields: FieldDef[];
}

export interface ExtractionView {
  id: string;
  extractorId: string;
  versionId: string;
  values: FieldResult[];
  createdAt: string;
  model: string | null;
  /** Observação sobre o uso de IA (motivo de não ter usado, ou quantos campos complementou). */
  note?: string;
}

/** Cria os extratores padrão da organização na primeira vez. */
export async function ensureDefaultExtractors(ctx: Ctx) {
  const count = await db.extractor.count({ where: { organizationId: ctx.orgId } });
  if (count > 0) return;
  await db.extractor.createMany({
    skipDuplicates: true,
    data: EXTRACTOR_TEMPLATES.map((t) => ({
      organizationId: ctx.orgId,
      name: t.name,
      documentKind: t.documentKind,
      description: t.description,
      template: t.template,
      fields: t.fields as unknown as Prisma.InputJsonValue,
      createdById: ctx.userId,
    })),
  });
}

export async function getExtractors(ctx: Ctx, opts: { includeInactive?: boolean } = {}): Promise<ExtractorView[]> {
  await ensureDefaultExtractors(ctx);
  const rows = await db.extractor.findMany({
    where: { organizationId: ctx.orgId, ...(opts.includeInactive ? {} : { active: true }) },
    orderBy: [{ template: { sort: "asc", nulls: "last" } }, { name: "asc" }],
  });
  return rows.map((r) => ({ id: r.id, name: r.name, documentKind: r.documentKind, description: r.description, template: r.template, active: r.active, fields: r.fields as unknown as FieldDef[] }));
}

export function toExtractionView(r: { id: string; extractorId: string; versionId: string; values: unknown; createdAt: Date; model: string | null }, note?: string): ExtractionView {
  return { id: r.id, extractorId: r.extractorId, versionId: r.versionId, values: (r.values as FieldResult[] | null) ?? [], createdAt: r.createdAt.toISOString(), model: r.model, note };
}

/** Últimos resultados de cada extrator para uma versão. */
export async function getLatestExtractions(versionId: string): Promise<ExtractionView[]> {
  const rows = await db.extractionResult.findMany({ where: { versionId, status: "DONE" }, orderBy: { createdAt: "desc" }, take: 30 });
  const seen = new Set<string>();
  return rows.filter((r) => !seen.has(r.extractorId) && seen.add(r.extractorId)).map((r) => toExtractionView(r));
}

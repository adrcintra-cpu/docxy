"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { guard, ok } from "@/lib/actions";
import { NotFoundError, UserError, type ActionResult } from "@/lib/errors";
import { getCtx, requireDocument, type Ctx } from "@/lib/access";
import { can } from "@/lib/auth/permissions";
import { ForbiddenError } from "@/lib/auth/session";
import { aiPolicy } from "@/lib/ai/policy";
import { AIUnavailableError, complete, parseJson, providerInfo } from "@/lib/ai/provider";
import { loadComparison, loadSource } from "@/lib/assist/server";
import { aiFieldsSchema, EXTRACTION_SYSTEM, extractionPrompt, mergeAiFields } from "@/lib/extract/ai";
import { compareExtractions, type ExtractionDiff } from "@/lib/extract/compare";
import { extractFields, interpretValue } from "@/lib/extract/rules";
import { ensureDefaultExtractors, toExtractionView, type ExtractionView, type ExtractorView } from "@/lib/extract/server";
import { EXTRACT_ENGINE, FIELD_TYPES, type FieldDef, type FieldResult } from "@/lib/extract/types";

const uuid = z.string().uuid("Identificador inválido.");

async function loadExtractor(ctx: Ctx, extractorId: string) {
  await ensureDefaultExtractors(ctx);
  const ex = await db.extractor.findFirst({ where: { id: uuid.parse(extractorId), organizationId: ctx.orgId } });
  if (!ex) throw new NotFoundError("Extrator");
  if (!ex.active) throw new UserError("Este extrator está desativado.");
  return { ...ex, fields: ex.fields as unknown as FieldDef[] };
}

/** Extrai os campos de uma versão: regras sempre; IA só complementa campos vazios, se autorizada. */
async function extract(ctx: Ctx, versionId: string, extractorId: string): Promise<ExtractionView> {
  const extractor = await loadExtractor(ctx, extractorId);
  const source = await loadSource(ctx, versionId, "extraction.run");
  let fields = extractFields(source.corpus, extractor.fields);
  let model: string | null = null;
  let note: string | undefined;

  const missing = fields.filter((f) => f.value === null && f.type !== "list");
  if (missing.length) {
    const policy = await aiPolicy(ctx, [source.documentId]);
    if (policy.allowed) {
      try {
        const defs = extractor.fields.filter((d) => missing.some((m) => m.key === d.key));
        const res = await complete({ system: EXTRACTION_SYSTEM, messages: [{ role: "user", content: extractionPrompt(source.corpus, defs) }], maxTokens: 2000 });
        const parsed = parseJson(res.text, aiFieldsSchema);
        if (parsed) {
          const merged = mergeAiFields(source.corpus, extractor.fields, fields, parsed);
          fields = merged.fields;
          model = merged.accepted ? res.model : null;
          note = merged.accepted
            ? `A IA complementou ${merged.accepted} ${merged.accepted === 1 ? "campo" : "campos"} com trecho verificado.`
            : "A IA não encontrou os campos que faltavam com evidência no documento.";
          if (merged.rejected) note += ` ${merged.rejected} ${merged.rejected === 1 ? "resposta foi descartada" : "respostas foram descartadas"} por não ter trecho correspondente.`;
        } else note = "A resposta da IA veio em formato inválido e foi ignorada.";
      } catch (err) {
        if (!(err instanceof AIUnavailableError)) throw err;
        note = `${err.message} Resultado só por regras.`;
      }
    } else if (policy.provider.configured) note = `IA não usada: ${policy.reason}`;
  }

  const row = await db.extractionResult.create({
    data: {
      extractorId: extractor.id,
      versionId: source.versionId,
      status: "DONE",
      values: fields as unknown as Prisma.InputJsonValue,
      engine: EXTRACT_ENGINE,
      model,
      requestedById: ctx.userId,
      completedAt: new Date(),
    },
  });
  await audit({
    event: "extraction.run",
    result: "SUCCESS",
    userId: ctx.userId,
    organizationId: ctx.orgId,
    documentId: source.documentId,
    versionId: source.versionId,
    metadata: { extractorId: extractor.id, found: fields.filter((f) => f.value !== null).length, total: fields.length, ai: Boolean(model) },
  });
  return toExtractionView(row, note);
}

export async function runExtraction(versionId: string, extractorId: string): Promise<ActionResult<ExtractionView>> {
  return guard(async () => ok(await extract(await getCtx(), versionId, extractorId)));
}

/** Corrige (ou valida) manualmente um campo. O valor original fica guardado. */
export async function correctField(resultId: string, key: string, value: string | null): Promise<ActionResult<FieldResult>> {
  return guard(async () => {
    const ctx = await getCtx();
    const row = await db.extractionResult.findFirst({
      where: { id: uuid.parse(resultId), extractor: { organizationId: ctx.orgId } },
      include: { version: { select: { documentId: true } } },
    });
    if (!row) throw new NotFoundError("Resultado");
    await requireDocument(ctx, row.version.documentId, "extraction.run");
    const values = (row.values as unknown as FieldResult[]) ?? [];
    const idx = values.findIndex((f) => f.key === key);
    if (idx < 0) throw new NotFoundError("Campo");
    const field = values[idx]!;
    const next = value === null ? null : z.string().trim().max(1000, "Valor muito longo.").parse(value) || null;
    const updated: FieldResult = {
      ...field,
      ...(next !== null ? { amount: undefined, currency: field.type === "currency" ? field.currency : undefined, start: undefined, end: undefined, ...interpretValue(field.type, next) } : {}),
      value: next,
      items: next === field.value ? field.items : undefined,
      source: "manual",
      confidence: 1,
      original: field.original ?? { value: field.value, source: field.source, confidence: field.confidence },
      correctedBy: ctx.userName,
      correctedAt: new Date().toISOString(),
    };
    values[idx] = updated;
    await db.extractionResult.update({ where: { id: row.id }, data: { values: values as unknown as Prisma.InputJsonValue } });
    await audit({ event: "extraction.correct", result: "SUCCESS", userId: ctx.userId, organizationId: ctx.orgId, documentId: row.version.documentId, versionId: row.versionId, metadata: { resultId: row.id, key } });
    return ok(updated, next === field.value ? "Valor validado." : "Correção salva.");
  });
}

// ─── Dashboard de comparação ────────────────────────────────────────────

export interface DashboardData {
  extractorId: string;
  base: ExtractionView;
  revised: ExtractionView;
  diff: ExtractionDiff;
}

/** Garante a extração dos dois lados (reaproveita a última do mesmo extrator) e compara. */
export async function getComparisonDashboard(comparisonId: string, extractorId: string, refresh = false): Promise<ActionResult<DashboardData>> {
  return guard(async () => {
    const ctx = await getCtx();
    const { comparison } = await loadComparison(ctx, comparisonId, "document.read");
    const extractor = await loadExtractor(ctx, extractorId);
    const latest = async (versionId: string) => {
      if (!refresh) {
        const r = await db.extractionResult.findFirst({ where: { versionId, extractorId: extractor.id, status: "DONE", engine: EXTRACT_ENGINE }, orderBy: { createdAt: "desc" } });
        if (r) return toExtractionView(r);
      }
      return extract(ctx, versionId, extractor.id);
    };
    const [base, revised] = await Promise.all([latest(comparison.baseVersionId), latest(comparison.revisedVersionId)]);
    const important = new Set<string>(extractor.fields.filter((f) => f.important).map((f) => f.key));
    return ok({ extractorId: extractor.id, base, revised, diff: compareExtractions(base.values, revised.values, important) });
  });
}

// ─── Extratores configuráveis ───────────────────────────────────────────

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40) || "campo";

const fieldInput = z.object({
  key: z.string().max(40).optional(),
  label: z.string().trim().min(1, "Dê um nome a cada campo.").max(80),
  type: z.enum(FIELD_TYPES),
  aliases: z.array(z.string().trim().min(1).max(60)).max(12).default([]),
  hint: z.string().trim().max(200).optional(),
  important: z.boolean().optional(),
});

const extractorInput = z.object({
  name: z.string().trim().min(2, "Dê um nome ao extrator.").max(80),
  documentKind: z.string().trim().min(2).max(40),
  description: z.string().trim().max(300).optional(),
  fields: z.array(fieldInput).min(1, "Inclua pelo menos um campo.").max(40, "No máximo 40 campos."),
});

function requireManage(ctx: Ctx) {
  if (!can(ctx.orgRole, "extractor.manage")) throw new ForbiddenError("extractor.manage");
}

function normalizeFields(fields: z.infer<typeof fieldInput>[]): FieldDef[] {
  const used = new Set<string>();
  return fields.map((f) => {
    let key = slug(f.key || f.label);
    while (used.has(key)) key = `${key}_2`;
    used.add(key);
    const aliases = f.aliases.length ? f.aliases : [f.label];
    return { key, label: f.label, type: f.type, aliases, ...(f.hint ? { hint: f.hint } : {}), ...(f.important ? { important: true } : {}) };
  });
}

export async function saveExtractor(id: string | null, input: z.input<typeof extractorInput>): Promise<ActionResult<ExtractorView>> {
  return guard(async () => {
    const ctx = await getCtx();
    requireManage(ctx);
    const data = extractorInput.parse(input);
    const fields = normalizeFields(data.fields) as unknown as Prisma.InputJsonValue;
    const exists = await db.extractor.findFirst({ where: { organizationId: ctx.orgId, name: data.name, ...(id ? { id: { not: id } } : {}) }, select: { id: true } });
    if (exists) throw new UserError("Já existe um extrator com esse nome.");
    const row = id
      ? await (async () => {
          const cur = await db.extractor.findFirst({ where: { id: uuid.parse(id), organizationId: ctx.orgId } });
          if (!cur) throw new NotFoundError("Extrator");
          return db.extractor.update({ where: { id: cur.id }, data: { name: data.name, documentKind: data.documentKind, description: data.description ?? null, fields } });
        })()
      : await db.extractor.create({ data: { organizationId: ctx.orgId, name: data.name, documentKind: data.documentKind, description: data.description ?? null, fields, createdById: ctx.userId } });
    await audit({ event: id ? "extractor.update" : "extractor.create", result: "SUCCESS", userId: ctx.userId, organizationId: ctx.orgId, metadata: { extractorId: row.id } });
    revalidatePath("/extratores");
    return ok({ id: row.id, name: row.name, documentKind: row.documentKind, description: row.description, template: row.template, active: row.active, fields: row.fields as unknown as FieldDef[] }, id ? "Extrator atualizado." : "Extrator criado.");
  });
}

export async function setExtractorActive(id: string, active: boolean): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getCtx();
    requireManage(ctx);
    const cur = await db.extractor.findFirst({ where: { id: uuid.parse(id), organizationId: ctx.orgId } });
    if (!cur) throw new NotFoundError("Extrator");
    await db.extractor.update({ where: { id: cur.id }, data: { active } });
    await audit({ event: active ? "extractor.activate" : "extractor.deactivate", result: "SUCCESS", userId: ctx.userId, organizationId: ctx.orgId, metadata: { extractorId: cur.id } });
    revalidatePath("/extratores");
    return ok(undefined, active ? "Extrator ativado." : "Extrator desativado.");
  });
}

// ─── Autorização de IA ──────────────────────────────────────────────────

/** Liga/desliga o envio de texto ao provedor de IA para toda a organização (só administradores). */
export async function setOrganizationAI(enabled: boolean): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getCtx();
    if (!can(ctx.orgRole, "org.manage")) throw new ForbiddenError("org.manage");
    const info = providerInfo();
    if (enabled && !info.configured) throw new UserError(info.reason ?? "Provedor de IA não configurado.");
    await db.organization.update({ where: { id: ctx.orgId }, data: { aiEnabled: enabled, aiEnabledAt: enabled ? new Date() : null, aiEnabledById: enabled ? ctx.userId : null } });
    await audit({ event: enabled ? "ai.enable" : "ai.disable", result: "SUCCESS", userId: ctx.userId, organizationId: ctx.orgId, metadata: { provider: info.provider, model: info.model ?? null } });
    revalidatePath("/extratores");
    return ok(undefined, enabled ? "IA autorizada para a organização." : "IA desligada. Nada mais será enviado ao provedor.");
  });
}

/** Marca um documento como confidencial: nunca é enviado à IA. */
export async function setDocumentAIBlocked(documentId: string, blocked: boolean): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getCtx();
    const { document } = await requireDocument(ctx, uuid.parse(documentId), "document.edit");
    await db.document.update({ where: { id: document.id }, data: { aiBlocked: blocked } });
    await audit({ event: blocked ? "document.ai_block" : "document.ai_unblock", result: "SUCCESS", userId: ctx.userId, organizationId: ctx.orgId, documentId: document.id });
    revalidatePath(`/documentos/${document.id}`);
    return ok(undefined, blocked ? "Este documento não será enviado à IA." : "Documento liberado para a IA da organização.");
  });
}

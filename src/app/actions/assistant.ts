"use server";

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { guard, ok } from "@/lib/actions";
import { NotFoundError, UserError, type ActionResult } from "@/lib/errors";
import { getCtx, type Ctx } from "@/lib/access";
import { aiPolicy } from "@/lib/ai/policy";
import { AIUnavailableError, complete, parseJson } from "@/lib/ai/provider";
import { aiAnswerSchema, ASSISTANT_SYSTEM, assistantPrompt, buildSources, ruleAnswer, validateAiAnswer } from "@/lib/assist/answer";
import { loadComparison, loadSource } from "@/lib/assist/server";
import { aiSummarySchema, applyAiSummary, buildSummary, SUMMARY_SYSTEM, summaryFacts, summaryPrompt, summaryToMarkdown } from "@/lib/assist/summaries";
import { SUMMARY_KINDS, type AnswerMode, type AssistantAnswer, type Citation, type ComparisonContext, type SourceDoc, type Summary } from "@/lib/assist/types";

const uuid = z.string().uuid("Identificador inválido.");
const MAX_PER_MINUTE = 20;

export interface ChatMessageView {
  id: string;
  role: "user" | "assistant";
  content: string;
  explanation?: string;
  citations: Citation[];
  found?: boolean;
  mode?: AnswerMode;
  note?: string;
  createdAt: string;
}

export interface ConversationView {
  id: string;
  title: string | null;
  updatedAt: string;
  messages: ChatMessageView[];
}

type Stored = { items?: Citation[]; explanation?: string; found?: boolean; note?: string } | null;

async function toMessageView(m: { id: string; role: string; content: string; citations: unknown; mode: string | null; createdAt: Date }): Promise<ChatMessageView> {
  const c = (m.citations as Stored) ?? {};
  return {
    id: m.id,
    role: m.role === "USER" ? "user" : "assistant",
    content: m.content,
    explanation: c.explanation,
    citations: c.items ?? [],
    found: c.found,
    mode: (m.mode as AnswerMode | null) ?? undefined,
    note: c.note,
    createdAt: m.createdAt.toISOString(),
  };
}

/** Carrega os documentos do contexto, verificando acesso a cada um. */
async function context(ctx: Ctx, input: { versionIds: string[]; comparisonId?: string | null }): Promise<{ docs: (SourceDoc & { documentId: string })[]; comparison?: ComparisonContext }> {
  if (input.comparisonId) {
    const c = await loadComparison(ctx, input.comparisonId, "ai.ask");
    return { docs: [c.base, c.revised], comparison: c.context };
  }
  const ids = z.array(uuid).min(1, "Abra um documento para perguntar.").max(5, "No máximo 5 documentos por conversa.").parse(input.versionIds);
  return { docs: await Promise.all(ids.map((id) => loadSource(ctx, id, "ai.ask"))) };
}

async function answer(ctx: Ctx, question: string, docs: (SourceDoc & { documentId: string })[], comparison: ComparisonContext | undefined, history: { role: "user" | "assistant"; content: string }[]): Promise<AssistantAnswer & { model?: string; note?: string }> {
  const policy = await aiPolicy(ctx, docs.map((d) => d.documentId));
  if (!policy.allowed) return { ...ruleAnswer(question, docs, comparison), note: policy.provider.configured ? `Sem IA: ${policy.reason}` : undefined };
  const sources = buildSources(question, docs, comparison);
  try {
    const res = await complete({ system: ASSISTANT_SYSTEM, messages: [{ role: "user", content: assistantPrompt(question, sources, history) }], maxTokens: 1200 });
    const parsed = parseJson(res.text, aiAnswerSchema);
    if (!parsed) return { ...ruleAnswer(question, docs, comparison), note: "A resposta da IA veio em formato inválido; mostrando a busca nos documentos." };
    return { ...validateAiAnswer(parsed, sources), model: res.model };
  } catch (err) {
    if (!(err instanceof AIUnavailableError)) throw err;
    return { ...ruleAnswer(question, docs, comparison), note: `${err.message} Mostrando a busca nos documentos.` };
  }
}

/** Pergunta ao assistente. Cria a conversa na primeira pergunta e grava o histórico. */
export async function askAssistant(input: { conversationId?: string | null; versionIds: string[]; comparisonId?: string | null; question: string }): Promise<ActionResult<{ conversationId: string; user: ChatMessageView; reply: ChatMessageView }>> {
  return guard(async () => {
    const ctx = await getCtx();
    const question = z.string().trim().min(2, "Escreva a pergunta.").max(1000, "Pergunta muito longa (máx. 1.000 caracteres).").parse(input.question);

    const recent = await db.aIMessage.count({ where: { role: "USER", createdAt: { gt: new Date(Date.now() - 60_000) }, conversation: { userId: ctx.userId } } });
    if (recent >= MAX_PER_MINUTE) throw new UserError("Muitas perguntas em sequência. Aguarde um minuto.");

    let conversation = input.conversationId
      ? await db.aIConversation.findFirst({ where: { id: uuid.parse(input.conversationId), userId: ctx.userId, organizationId: ctx.orgId } })
      : null;
    if (input.conversationId && !conversation) throw new NotFoundError("Conversa");
    const scope = conversation ? { versionIds: conversation.versionIds, comparisonId: conversation.comparisonId } : { versionIds: input.versionIds, comparisonId: input.comparisonId };
    const { docs, comparison } = await context(ctx, scope);

    const history = conversation
      ? (await db.aIMessage.findMany({ where: { conversationId: conversation.id }, orderBy: { createdAt: "desc" }, take: 6 })).reverse().map((m) => ({ role: m.role === "USER" ? ("user" as const) : ("assistant" as const), content: m.content.slice(0, 1500) }))
      : [];
    const reply = await answer(ctx, question, docs, comparison, history);

    if (!conversation)
      conversation = await db.aIConversation.create({
        data: { organizationId: ctx.orgId, userId: ctx.userId, title: question.slice(0, 80), versionIds: docs.map((d) => d.versionId), comparisonId: scope.comparisonId ?? null },
      });
    const [u, a] = await db.$transaction([
      db.aIMessage.create({ data: { conversationId: conversation.id, role: "USER", content: question } }),
      db.aIMessage.create({
        data: {
          conversationId: conversation.id,
          role: "ASSISTANT",
          content: reply.answer,
          mode: reply.mode,
          model: reply.model ?? null,
          citations: { items: reply.citations, explanation: reply.explanation, found: reply.found, note: reply.note } as unknown as Prisma.InputJsonValue,
        },
      }),
      db.aIConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } }),
    ]);
    // Auditoria sem o conteúdo da pergunta (pode ser sensível).
    await audit({ event: "ai.ask", result: "SUCCESS", userId: ctx.userId, organizationId: ctx.orgId, versionId: docs[0]?.versionId, metadata: { conversationId: conversation.id, mode: reply.mode, citations: reply.citations.length, found: reply.found } });
    return ok({ conversationId: conversation.id, user: await toMessageView(u), reply: await toMessageView(a) });
  });
}

/** Conversas do usuário sobre estes documentos (ou esta comparação), mais recentes primeiro. */
export async function listConversations(input: { versionIds: string[]; comparisonId?: string | null }): Promise<ActionResult<{ id: string; title: string | null; updatedAt: string }[]>> {
  return guard(async () => {
    const ctx = await getCtx();
    await context(ctx, input); // confere acesso
    const rows = await db.aIConversation.findMany({
      where: { organizationId: ctx.orgId, userId: ctx.userId, ...(input.comparisonId ? { comparisonId: input.comparisonId } : { comparisonId: null, versionIds: { hasEvery: input.versionIds } }) },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: { id: true, title: true, updatedAt: true },
    });
    return ok(rows.map((r) => ({ id: r.id, title: r.title, updatedAt: r.updatedAt.toISOString() })));
  });
}

export async function getConversation(conversationId: string): Promise<ActionResult<ConversationView>> {
  return guard(async () => {
    const ctx = await getCtx();
    const c = await db.aIConversation.findFirst({ where: { id: uuid.parse(conversationId), userId: ctx.userId, organizationId: ctx.orgId }, include: { messages: { orderBy: { createdAt: "asc" }, take: 200 } } });
    if (!c) throw new NotFoundError("Conversa");
    await context(ctx, { versionIds: c.versionIds, comparisonId: c.comparisonId }); // o acesso pode ter sido revogado
    return ok({ id: c.id, title: c.title, updatedAt: c.updatedAt.toISOString(), messages: await Promise.all(c.messages.map(toMessageView)) });
  });
}

// ─── Resumos ────────────────────────────────────────────────────────────

export async function generateSummary(input: { kind: string; versionIds: string[]; comparisonId?: string | null; useAI?: boolean }): Promise<ActionResult<{ summary: Summary; markdown: string; note?: string }>> {
  return guard(async () => {
    const ctx = await getCtx();
    const kind = z.enum(SUMMARY_KINDS).parse(input.kind);
    const { docs, comparison } = await context(ctx, input);
    let summary = buildSummary(kind, docs, comparison);
    let note: string | undefined;
    if (input.useAI !== false && !summary.notice) {
      const policy = await aiPolicy(ctx, docs.map((d) => d.documentId));
      if (policy.allowed) {
        const facts = summaryFacts(summary);
        try {
          const res = await complete({ system: SUMMARY_SYSTEM, messages: [{ role: "user", content: summaryPrompt(kind, facts) }], maxTokens: 1500 });
          const parsed = parseJson(res.text, aiSummarySchema);
          const ai = parsed ? applyAiSummary(summary, facts, parsed) : null;
          if (ai) summary = ai;
          else note = "A IA não devolveu um resumo apoiado nos fatos; mostrando a versão por regras.";
        } catch (err) {
          if (!(err instanceof AIUnavailableError)) throw err;
          note = `${err.message} Mostrando a versão por regras.`;
        }
      } else if (policy.provider.configured) note = `Sem IA: ${policy.reason}`;
    }
    await audit({ event: "summary.generate", result: "SUCCESS", userId: ctx.userId, organizationId: ctx.orgId, versionId: docs[0]?.versionId, metadata: { kind, mode: summary.generatedBy } });
    return ok({ summary, markdown: summaryToMarkdown(summary, docs), note });
  });
}

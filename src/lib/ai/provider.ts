import "server-only";
import { z } from "zod";

/**
 * Provedor de IA configurável, só no servidor.
 *
 *   AI_PROVIDER = none | anthropic | openai   (openai = qualquer API compatível: OpenAI, Azure, local)
 *   AI_MODEL    = modelo (padrão do Anthropic: claude-sonnet-5-5; obrigatório para openai)
 *   AI_API_KEY  = chave do provedor (ou ANTHROPIC_API_KEY / OPENAI_API_KEY)
 *   AI_BASE_URL = endpoint (opcional; padrão do provedor)
 *
 * As chaves nunca chegam ao navegador. Ter o provedor configurado não basta para enviar
 * documentos: a organização precisa autorizar (Organization.aiEnabled) — ver src/lib/ai/policy.ts.
 */

const schema = z.object({
  AI_PROVIDER: z.enum(["none", "anthropic", "openai"]).default("none"),
  AI_MODEL: z.string().optional(),
  AI_API_KEY: z.string().optional(),
  AI_BASE_URL: z.string().url().optional(),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
});

function config() {
  const env = schema.parse({
    AI_PROVIDER: process.env.AI_PROVIDER || undefined,
    AI_MODEL: process.env.AI_MODEL || undefined,
    AI_API_KEY: process.env.AI_API_KEY || (process.env.AI_PROVIDER === "anthropic" ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY) || undefined,
    AI_BASE_URL: process.env.AI_BASE_URL || undefined,
    AI_TIMEOUT_MS: process.env.AI_TIMEOUT_MS || undefined,
  });
  const model = env.AI_MODEL ?? (env.AI_PROVIDER === "anthropic" ? "claude-sonnet-5-5" : undefined);
  return { ...env, model };
}

export interface ProviderInfo {
  configured: boolean;
  provider: "none" | "anthropic" | "openai";
  model?: string;
  /** Motivo, quando não configurado. */
  reason?: string;
}

export function providerInfo(): ProviderInfo {
  const c = config();
  if (c.AI_PROVIDER === "none") return { configured: false, provider: "none", reason: "Nenhum provedor de IA configurado no servidor (AI_PROVIDER)." };
  if (!c.AI_API_KEY) return { configured: false, provider: c.AI_PROVIDER, reason: "Falta a chave do provedor de IA (AI_API_KEY)." };
  if (!c.model) return { configured: false, provider: c.AI_PROVIDER, reason: "Falta o modelo de IA (AI_MODEL)." };
  return { configured: true, provider: c.AI_PROVIDER, model: c.model };
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CompleteInput {
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
}

export class AIUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIUnavailableError";
  }
}

/** Chamada de texto ao provedor. Lança AIUnavailableError com mensagem segura para o usuário. */
export async function complete(input: CompleteInput): Promise<{ text: string; model: string }> {
  const c = config();
  const info = providerInfo();
  if (!info.configured) throw new AIUnavailableError(info.reason!);
  const signal = AbortSignal.timeout(c.AI_TIMEOUT_MS);
  let res: Response;
  try {
    if (c.AI_PROVIDER === "anthropic") {
      res = await fetch(`${c.AI_BASE_URL ?? "https://api.anthropic.com"}/v1/messages`, {
        method: "POST",
        signal,
        headers: { "content-type": "application/json", "x-api-key": c.AI_API_KEY!, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: c.model, max_tokens: input.maxTokens ?? 1500, temperature: input.temperature ?? 0, system: input.system, messages: input.messages }),
      });
    } else {
      res = await fetch(`${c.AI_BASE_URL ?? "https://api.openai.com/v1"}/chat/completions`, {
        method: "POST",
        signal,
        headers: { "content-type": "application/json", authorization: `Bearer ${c.AI_API_KEY}` },
        body: JSON.stringify({ model: c.model, max_tokens: input.maxTokens ?? 1500, temperature: input.temperature ?? 0, messages: [{ role: "system", content: input.system }, ...input.messages] }),
      });
    }
  } catch (err) {
    console.error("[ai]", err instanceof Error ? err.name : err);
    throw new AIUnavailableError("O provedor de IA não respondeu a tempo. Tente novamente.");
  }
  if (!res.ok) {
    console.error("[ai] status", res.status);
    throw new AIUnavailableError(res.status === 429 ? "O provedor de IA está com limite de uso atingido. Tente em instantes." : "O provedor de IA recusou a solicitação.");
  }
  const body = (await res.json()) as { content?: { type: string; text?: string }[]; choices?: { message?: { content?: string } }[] };
  const text = c.AI_PROVIDER === "anthropic" ? (body.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("") : (body.choices?.[0]?.message?.content ?? "");
  return { text, model: c.model! };
}

export { parseJson } from "./json";

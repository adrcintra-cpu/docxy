import "server-only";
import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { ForbiddenError } from "@/lib/auth/session";
import { NotFoundError, UserError, type ActionResult } from "@/lib/errors";

/**
 * Envolve uma Server Action: converte erros conhecidos em mensagens para o usuário
 * e nunca vaza detalhes internos. Redirecionamentos do Next continuam funcionando.
 */
export async function guard<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof ForbiddenError) return { ok: false, error: "Você não tem permissão para esta ação." };
    if (err instanceof NotFoundError) return { ok: false, error: "Item não encontrado ou você não tem acesso a ele." };
    if (err instanceof UserError) return { ok: false, error: err.message };
    if (err instanceof ZodError) return { ok: false, error: err.issues[0]?.message ?? "Dados inválidos." };
    console.error("[action]", err instanceof Error ? err.message : err);
    return { ok: false, error: "Não foi possível concluir. Tente novamente." };
  }
}

export const ok = <T>(data?: T, message?: string): ActionResult<T> => ({ ok: true, data, message });

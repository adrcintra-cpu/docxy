import "server-only";
import { db } from "@/lib/db";
import type { Ctx } from "@/lib/access";
import { providerInfo, type ProviderInfo } from "./provider";

export interface AIPolicy {
  /** Pode enviar o texto destes documentos ao provedor de IA. */
  allowed: boolean;
  /** Por que não (mostrado ao usuário). */
  reason?: string;
  provider: ProviderInfo;
  orgEnabled: boolean;
}

/**
 * Decide se texto de documentos pode ir para o provedor de IA. Precisa de tudo isto:
 *  1. provedor configurado no servidor (chave só no backend);
 *  2. autorização explícita da organização (desligada por padrão, só administradores ligam);
 *  3. nenhum dos documentos marcado como confidencial ("não enviar à IA").
 * Sem isso, as ferramentas funcionam por regras determinísticas, sem enviar nada.
 */
export async function aiPolicy(ctx: Ctx, documentIds: string[] = []): Promise<AIPolicy> {
  const provider = providerInfo();
  const org = await db.organization.findUnique({ where: { id: ctx.orgId }, select: { aiEnabled: true } });
  const orgEnabled = Boolean(org?.aiEnabled);
  if (!provider.configured) return { allowed: false, reason: provider.reason, provider, orgEnabled };
  if (!orgEnabled) return { allowed: false, reason: "A IA não foi autorizada pela organização. Um administrador pode ligar em Extrator › Configurações de IA.", provider, orgEnabled };
  if (documentIds.length) {
    const blocked = await db.document.count({ where: { id: { in: documentIds }, organizationId: ctx.orgId, aiBlocked: true } });
    if (blocked) return { allowed: false, reason: "Documento marcado como confidencial: não é enviado ao provedor de IA.", provider, orgEnabled };
  }
  return { allowed: true, provider, orgEnabled };
}

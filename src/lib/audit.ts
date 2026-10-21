import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import type { AuditResult, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { serverEnv } from "@/lib/env.server";

interface AuditInput {
  event: string;
  result: AuditResult;
  userId?: string | null;
  organizationId?: string | null;
  documentId?: string | null;
  versionId?: string | null;
  /** Somente metadados não sensíveis. Nunca conteúdo de documento, senha ou token. */
  metadata?: Prisma.InputJsonValue;
}

function hashIp(ip: string | null) {
  if (!ip) return null;
  const salt = serverEnv.AUDIT_IP_SALT ?? serverEnv.SUPABASE_SERVICE_ROLE_KEY.slice(-16);
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

/** Registra um evento de auditoria. Falhas de gravação não derrubam a ação do usuário. */
export async function audit(input: AuditInput) {
  try {
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip");
    await db.auditLog.create({
      data: {
        event: input.event,
        result: input.result,
        userId: input.userId ?? null,
        organizationId: input.organizationId ?? null,
        documentId: input.documentId ?? null,
        versionId: input.versionId ?? null,
        metadata: input.metadata,
        ipHash: hashIp(ip),
        userAgent: h.get("user-agent")?.slice(0, 255) ?? null,
      },
    });
  } catch (err) {
    console.error("[audit] falha ao registrar evento", input.event, err instanceof Error ? err.message : err);
  }
}

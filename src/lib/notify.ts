import "server-only";
import type { NotificationType } from "@prisma/client";
import { db } from "@/lib/db";

/** Cria notificações internas. Nunca inclui conteúdo do documento, só títulos e links. */
export async function notify(input: {
  organizationId: string;
  userIds: string[];
  type: NotificationType;
  title: string;
  body?: string;
  href?: string;
  /** Quem causou o evento não recebe a própria notificação. */
  exceptUserId?: string;
}) {
  const ids = [...new Set(input.userIds)].filter((id) => id !== input.exceptUserId);
  if (ids.length === 0) return;
  try {
    await db.notification.createMany({
      data: ids.map((userId) => ({
        organizationId: input.organizationId,
        userId,
        type: input.type,
        title: input.title.slice(0, 200),
        body: input.body?.slice(0, 500),
        href: input.href,
      })),
    });
  } catch (err) {
    console.error("[notify]", err instanceof Error ? err.message : err);
  }
}

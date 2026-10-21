import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { OrganizationMember, Organization, User } from "@prisma/client";
import { db } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";
import { can, type Action } from "./permissions";

export const ACTIVE_ORG_COOKIE = "docxy_org";

export class ForbiddenError extends Error {
  constructor(public action: Action) {
    super(`Sem permissão para ${action}`);
    this.name = "ForbiddenError";
  }
}

/**
 * Usuário autenticado (validado no Supabase a cada requisição, não só pelo cookie)
 * e seu registro em public.users. Memoizado por requisição.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  // O trigger handle_new_user cria o registro; o upsert cobre bancos sem o trigger ainda.
  return db.user.upsert({
    where: { id: user.id },
    update: {},
    create: {
      id: user.id,
      email: user.email,
      name: (user.user_metadata?.full_name as string | undefined) ?? (user.user_metadata?.name as string | undefined),
      avatarUrl: user.user_metadata?.avatar_url as string | undefined,
    },
  });
});

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export type ActiveMembership = OrganizationMember & { organization: Organization };

/** Organização ativa: a escolhida no cookie, se o usuário for membro ativo; senão a primeira. */
export const getActiveMembership = cache(async (userId: string): Promise<ActiveMembership | null> => {
  const memberships = await db.organizationMember.findMany({
    where: { userId, active: true, organization: { deletedAt: null } },
    include: { organization: true },
    orderBy: { createdAt: "asc" },
  });
  if (memberships.length === 0) return bootstrapFirstAdmin(userId);
  const preferred = (await cookies()).get(ACTIVE_ORG_COOKIE)?.value;
  return memberships.find((m) => m.organizationId === preferred) ?? memberships[0] ?? null;
});

/**
 * Garante sessão + organização + permissão, no servidor. Use no início de toda
 * Server Action ou Route Handler que leia ou altere dados.
 */
export async function requirePermission(action: Action) {
  const user = await requireUser();
  const membership = await getActiveMembership(user.id);
  if (!membership || !can(membership.role, action)) {
    await audit({
      event: "permission.denied",
      result: "DENIED",
      userId: user.id,
      organizationId: membership?.organizationId,
      metadata: { action },
    });
    throw new ForbiddenError(action);
  }
  return { user, membership };
}

/**
 * Primeiro acesso em produção, sem terminal: se ainda não existe nenhuma organização e o
 * e-mail do usuário é BOOTSTRAP_ADMIN_EMAIL, cria a organização (BOOTSTRAP_ORG_NAME) e o
 * torna administrador. Depois da primeira organização, nunca mais age.
 */
async function bootstrapFirstAdmin(userId: string): Promise<ActiveMembership | null> {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  if (!email) return null;
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (user?.email.toLowerCase() !== email) return null;
  if ((await db.organization.count()) > 0) return null;
  const name = process.env.BOOTSTRAP_ORG_NAME?.trim() || "Minha organização";
  const slug = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "org";
  const membership = await db.$transaction(async (tx) => {
    const org = await tx.organization.create({ data: { name, slug } });
    return tx.organizationMember.create({ data: { organizationId: org.id, userId, role: "ADMIN" }, include: { organization: true } });
  });
  await audit({ event: "org.bootstrap", result: "SUCCESS", userId, organizationId: membership.organizationId });
  return membership;
}

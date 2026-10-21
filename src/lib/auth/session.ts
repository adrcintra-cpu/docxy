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
  if (memberships.length === 0) return null;
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

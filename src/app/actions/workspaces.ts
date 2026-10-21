"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { can, ROLE_LABEL } from "@/lib/auth/permissions";
import { ForbiddenError } from "@/lib/auth/session";
import { guard, ok } from "@/lib/actions";
import { NotFoundError, UserError, type ActionResult } from "@/lib/errors";
import { getCtx, requireWorkspace, type Ctx } from "@/lib/access";
import { publicEnv } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/server";

const RANK: Record<Role, number> = { VIEWER: 0, WRITER: 1, EDITOR: 2, OWNER: 3, ADMIN: 4 };
const uuid = z.string().uuid("Item inválido.");
const wsName = z.string().trim().min(2, "Use pelo menos 2 caracteres.").max(80, "Use no máximo 80 caracteres.");
const memberRole = z.enum(["VIEWER", "WRITER", "EDITOR", "OWNER"], { message: "Escolha um perfil." });
const emailSchema = z.string().trim().toLowerCase().email("Informe um e-mail válido.");

const INVITE_DAYS = 7;

function refresh(workspaceId?: string) {
  revalidatePath("/workspaces");
  if (workspaceId) revalidatePath(`/workspaces/${workspaceId}`);
}

// ─── Workspaces ─────────────────────────────────────────────────────────

export async function createWorkspace(input: { name: string; description?: string }): Promise<ActionResult<{ id: string }>> {
  return guard(async () => {
    const ctx = await getCtx();
    if (!can(ctx.orgRole, "workspace.create")) throw new ForbiddenError("workspace.create");
    const name = wsName.parse(input.name);
    const taken = await db.workspace.findFirst({ where: { organizationId: ctx.orgId, name: { equals: name, mode: "insensitive" }, deletedAt: null } });
    if (taken) throw new UserError("Já existe um workspace com esse nome.");

    const ws = await db.workspace.create({
      data: {
        organizationId: ctx.orgId,
        name,
        description: input.description?.trim().slice(0, 500) || null,
        members: { create: { userId: ctx.userId, role: "OWNER" } },
      },
    });
    await audit({ event: "workspace.create", result: "SUCCESS", userId: ctx.userId, organizationId: ctx.orgId, metadata: { workspaceId: ws.id } });
    refresh();
    return ok({ id: ws.id }, "Workspace criado.");
  });
}

export async function updateWorkspace(workspaceId: string, input: { name: string; description?: string }): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getCtx();
    const { workspace } = await requireWorkspace(ctx, uuid.parse(workspaceId), "workspace.manage");
    const name = wsName.parse(input.name);
    const taken = await db.workspace.findFirst({
      where: { organizationId: ctx.orgId, id: { not: workspace.id }, name: { equals: name, mode: "insensitive" }, deletedAt: null },
    });
    if (taken) throw new UserError("Já existe um workspace com esse nome.");
    await db.workspace.update({ where: { id: workspace.id }, data: { name, description: input.description?.trim().slice(0, 500) || null } });
    await audit({ event: "workspace.update", result: "SUCCESS", userId: ctx.userId, organizationId: ctx.orgId, metadata: { workspaceId } });
    refresh(workspace.id);
    return ok(undefined, "Workspace atualizado.");
  });
}

/** "Habilitar grupo?" — desativado, os membros perdem o acesso às pastas do workspace. */
export async function setWorkspaceActive(workspaceId: string, active: boolean): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getCtx();
    const { workspace } = await requireWorkspace(ctx, uuid.parse(workspaceId), "workspace.manage");
    await db.workspace.update({ where: { id: workspace.id }, data: { active } });
    await audit({ event: active ? "workspace.enable" : "workspace.disable", result: "SUCCESS", userId: ctx.userId, organizationId: ctx.orgId, metadata: { workspaceId } });
    refresh(workspace.id);
    return ok(undefined, active ? "Workspace ativado." : "Workspace desativado.");
  });
}

/** Exclusão lógica. Pastas e documentos do workspace não são apagados. */
export async function deleteWorkspace(workspaceId: string): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getCtx();
    const { workspace } = await requireWorkspace(ctx, uuid.parse(workspaceId), "workspace.manage");
    const folders = await db.folder.count({ where: { workspaceId: workspace.id, deletedAt: null } });
    if (folders > 0) {
      throw new UserError(`Mova ou envie para a lixeira as ${folders} pasta(s) deste workspace antes de excluí-lo.`);
    }
    await db.workspace.update({ where: { id: workspace.id }, data: { deletedAt: new Date(), active: false } });
    await audit({ event: "workspace.delete", result: "SUCCESS", userId: ctx.userId, organizationId: ctx.orgId, metadata: { workspaceId } });
    refresh();
    return ok(undefined, "Workspace excluído.");
  });
}

// ─── Membros ────────────────────────────────────────────────────────────

export type AddMemberResult = { kind: "added" } | { kind: "invited"; link: string; emailSent: boolean };

export async function addWorkspaceMember(workspaceId: string, input: { email: string; role: Role }): Promise<ActionResult<AddMemberResult>> {
  return guard(async () => {
    const ctx = await getCtx();
    const { workspace, role: myRole } = await requireWorkspace(ctx, uuid.parse(workspaceId), "member.invite");
    const email = emailSchema.parse(input.email);
    const role = memberRole.parse(input.role);
    if (RANK[role] > RANK[myRole]) throw new UserError(`Seu perfil permite conceder no máximo ${ROLE_LABEL[myRole]}.`);

    const orgMember = await db.organizationMember.findFirst({
      where: { organizationId: ctx.orgId, active: true, user: { email: { equals: email, mode: "insensitive" } } },
      select: { userId: true },
    });

    if (orgMember) {
      await db.workspaceMember.upsert({
        where: { workspaceId_userId: { workspaceId: workspace.id, userId: orgMember.userId } },
        update: { role },
        create: { workspaceId: workspace.id, userId: orgMember.userId, role },
      });
      await notify({
        organizationId: ctx.orgId,
        userIds: [orgMember.userId],
        exceptUserId: ctx.userId,
        type: "WORKSPACE_INVITE",
        title: `Você foi adicionado a ${workspace.name}`,
        body: `Perfil: ${ROLE_LABEL[role]}.`,
        href: `/workspaces/${workspace.id}`,
      });
      await audit({ event: "workspace.member_add", result: "SUCCESS", userId: ctx.userId, organizationId: ctx.orgId, metadata: { workspaceId, role } });
      refresh(workspace.id);
      return ok<AddMemberResult>({ kind: "added" }, "Pessoa adicionada.");
    }

    // Ainda não é da organização: convite para a organização + este workspace.
    const invite = await createInvitation(ctx, { email, role: "VIEWER", workspaceId: workspace.id, workspaceRole: role });
    refresh(workspace.id);
    return ok<AddMemberResult>({ kind: "invited", ...invite }, invite.emailSent ? "Convite enviado por e-mail." : "Convite criado.");
  });
}

export async function updateWorkspaceMember(workspaceId: string, userId: string, role: Role): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getCtx();
    const { workspace, role: myRole } = await requireWorkspace(ctx, uuid.parse(workspaceId), "workspace.manage");
    const next = memberRole.parse(role);
    if (RANK[next] > RANK[myRole]) throw new UserError(`Seu perfil permite conceder no máximo ${ROLE_LABEL[myRole]}.`);
    await assertKeepsAnOwner(workspace.id, uuid.parse(userId), next);
    await db.workspaceMember.update({ where: { workspaceId_userId: { workspaceId: workspace.id, userId } }, data: { role: next } });
    await audit({ event: "workspace.member_role", result: "SUCCESS", userId: ctx.userId, organizationId: ctx.orgId, metadata: { workspaceId, role: next } });
    refresh(workspace.id);
    return ok(undefined, "Perfil atualizado.");
  });
}

export async function removeWorkspaceMember(workspaceId: string, userId: string): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getCtx();
    const target = uuid.parse(userId);
    // Qualquer membro pode sair; remover outra pessoa exige gerenciar o workspace.
    const { workspace } = await requireWorkspace(ctx, uuid.parse(workspaceId), target === ctx.userId ? "document.read" : "workspace.manage");
    await assertKeepsAnOwner(workspace.id, target, null);
    await db.workspaceMember.delete({ where: { workspaceId_userId: { workspaceId: workspace.id, userId: target } } });
    await audit({ event: "workspace.member_remove", result: "SUCCESS", userId: ctx.userId, organizationId: ctx.orgId, metadata: { workspaceId } });
    refresh(workspace.id);
    return ok(undefined, target === ctx.userId ? "Você saiu do workspace." : "Pessoa removida.");
  });
}

/** O workspace nunca fica sem nenhum Owner. */
async function assertKeepsAnOwner(workspaceId: string, userId: string, nextRole: Role | null) {
  const current = await db.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
  if (!current) throw new NotFoundError("Membro");
  if (current.role !== "OWNER" || nextRole === "OWNER") return;
  const owners = await db.workspaceMember.count({ where: { workspaceId, role: "OWNER" } });
  if (owners <= 1) throw new UserError("O workspace precisa de pelo menos um Owner. Promova outra pessoa antes.");
}

// ─── Convites ───────────────────────────────────────────────────────────

/** Convite só para a organização (sem workspace). Apenas administradores. */
export async function inviteToOrganization(input: { email: string; role: Role }): Promise<ActionResult<{ link: string; emailSent: boolean }>> {
  return guard(async () => {
    const ctx = await getCtx();
    if (!can(ctx.orgRole, "member.manage")) throw new ForbiddenError("member.manage");
    const email = emailSchema.parse(input.email);
    const role = z.enum(["VIEWER", "WRITER", "EDITOR", "OWNER", "ADMIN"]).parse(input.role);
    const already = await db.organizationMember.findFirst({
      where: { organizationId: ctx.orgId, active: true, user: { email: { equals: email, mode: "insensitive" } } },
    });
    if (already) throw new UserError("Essa pessoa já faz parte da organização.");
    const invite = await createInvitation(ctx, { email, role });
    return ok(invite, invite.emailSent ? "Convite enviado por e-mail." : "Convite criado.");
  });
}

export async function revokeInvitation(invitationId: string): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getCtx();
    const inv = await db.invitation.findFirst({ where: { id: uuid.parse(invitationId), organizationId: ctx.orgId, status: "PENDING" } });
    if (!inv) throw new NotFoundError("Convite");
    if (inv.invitedById !== ctx.userId && !can(ctx.orgRole, "member.manage")) throw new ForbiddenError("member.manage");
    await db.invitation.update({ where: { id: inv.id }, data: { status: "REVOKED" } });
    await audit({ event: "invite.revoke", result: "SUCCESS", userId: ctx.userId, organizationId: ctx.orgId });
    refresh(inv.workspaceId ?? undefined);
    return ok(undefined, "Convite cancelado.");
  });
}

/**
 * Gera um convite de uso único (o token só existe no link; o banco guarda o hash).
 * Para quem ainda não tem conta, o Supabase envia o e-mail de convite. Quem já tem conta
 * recebe o link para copiar — o Supabase não envia e-mails avulsos.
 */
async function createInvitation(ctx: Ctx, input: { email: string; role: Role; workspaceId?: string; workspaceRole?: Role }) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");

  // Um convite pendente por e-mail e destino: o anterior é substituído.
  await db.invitation.updateMany({
    where: { organizationId: ctx.orgId, email: input.email, workspaceId: input.workspaceId ?? null, status: "PENDING" },
    data: { status: "REVOKED" },
  });
  await db.invitation.create({
    data: {
      organizationId: ctx.orgId,
      workspaceId: input.workspaceId ?? null,
      email: input.email,
      // Com workspace: `role` é o papel no workspace (na organização a pessoa entra como Viewer).
      // Sem workspace: `role` é o papel na organização.
      role: input.workspaceId ? (input.workspaceRole ?? "VIEWER") : input.role,
      tokenHash,
      invitedById: ctx.userId,
      expiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000),
    },
  });

  const link = new URL(`/convite/${token}`, publicEnv.NEXT_PUBLIC_SITE_URL).toString();
  let emailSent = false;
  const hasAccount = await db.user.findFirst({ where: { email: { equals: input.email, mode: "insensitive" } }, select: { id: true } });
  if (!hasAccount) {
    const redirectTo = new URL(`/auth/callback?next=${encodeURIComponent(`/convite/${token}`)}`, publicEnv.NEXT_PUBLIC_SITE_URL).toString();
    const { error } = await createServiceClient().auth.admin.inviteUserByEmail(input.email, { redirectTo });
    emailSent = !error;
    if (error) console.error("[invite] e-mail não enviado:", error.message);
  }
  await audit({ event: "invite.create", result: "SUCCESS", userId: ctx.userId, organizationId: ctx.orgId, metadata: { workspaceId: input.workspaceId ?? null, emailSent } });
  return { link, emailSent };
}

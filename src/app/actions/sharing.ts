"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { ROLE_LABEL } from "@/lib/auth/permissions";
import { guard, ok } from "@/lib/actions";
import { NotFoundError, UserError, type ActionResult } from "@/lib/errors";
import { getCtx, requireDocument, requireFolder, requireWorkspace, type Ctx } from "@/lib/access";

const RANK: Record<Role, number> = { VIEWER: 0, WRITER: 1, EDITOR: 2, OWNER: 3, ADMIN: 4 };
const grantable = z.enum(["VIEWER", "WRITER", "EDITOR", "OWNER"], { message: "Escolha um perfil de acesso." });
const kindSchema = z.enum(["folder", "document"]);

type ItemRef = { role: Role; title: string; href: string; where: { folderId?: string; documentId?: string } };

async function requireItem(ctx: Ctx, kind: "folder" | "document", itemId: string): Promise<ItemRef> {
  if (kind === "folder") {
    const { folder, role } = await requireFolder(ctx, itemId, "document.share");
    return { role, title: folder.name, href: `/pastas/${folder.id}`, where: { folderId: folder.id } };
  }
  const { document, role } = await requireDocument(ctx, itemId, "document.share");
  return { role, title: document.title, href: `/documentos/${document.id}`, where: { documentId: document.id } };
}

/** Ninguém concede um perfil acima do próprio. */
function assertCanGrant(myRole: Role, role: Role) {
  if (RANK[role] > RANK[myRole]) throw new UserError(`Seu perfil permite conceder no máximo ${ROLE_LABEL[myRole]}.`);
}

/** Compartilha uma pasta ou documento com uma pessoa da organização ("Add Pessoa"). */
export async function shareWithPerson(input: { kind: "folder" | "document"; id: string; email: string; role: Role }): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getCtx();
    const kind = kindSchema.parse(input.kind);
    const role = grantable.parse(input.role);
    const email = z.string().trim().toLowerCase().email("Informe um e-mail válido.").parse(input.email);
    const item = await requireItem(ctx, kind, z.string().uuid().parse(input.id));
    assertCanGrant(item.role, role);

    const member = await db.organizationMember.findFirst({
      where: { organizationId: ctx.orgId, active: true, user: { email: { equals: email, mode: "insensitive" } } },
      select: { userId: true },
    });
    if (!member) {
      throw new UserError("Essa pessoa ainda não faz parte da organização. Convide-a pela tela de Workspaces.");
    }
    if (member.userId === ctx.userId) throw new UserError("Você já tem acesso a este item.");

    const existing = await db.documentPermission.findFirst({ where: { ...item.where, userId: member.userId }, select: { id: true } });
    if (existing) await db.documentPermission.update({ where: { id: existing.id }, data: { role } });
    else await db.documentPermission.create({ data: { ...item.where, userId: member.userId, role } });

    await audit({ event: "share.grant", result: "SUCCESS", userId: ctx.userId, organizationId: ctx.orgId, documentId: item.where.documentId ?? null, metadata: { kind, role, ...item.where } });
    await notify({
      organizationId: ctx.orgId,
      userIds: [member.userId],
      type: "DOCUMENT_SHARED",
      title: `${ctx.userName} compartilhou "${item.title}" com você`,
      body: `Perfil de acesso: ${ROLE_LABEL[role]}.`,
      href: item.href,
    });
    revalidatePath(item.href);
    return ok(undefined, "Acesso concedido.");
  });
}

export async function updatePermission(permissionId: string, role: Role): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getCtx();
    const perm = await db.documentPermission.findUnique({ where: { id: z.string().uuid().parse(permissionId) } });
    if (!perm) throw new NotFoundError("Permissão");
    const item = await requireItem(ctx, perm.folderId ? "folder" : "document", (perm.folderId ?? perm.documentId)!);
    const next = grantable.parse(role);
    assertCanGrant(item.role, next);
    await db.documentPermission.update({ where: { id: perm.id }, data: { role: next } });
    await audit({ event: "share.update", result: "SUCCESS", userId: ctx.userId, organizationId: ctx.orgId, metadata: { permissionId, role: next } });
    revalidatePath(item.href);
    return ok(undefined, "Perfil atualizado.");
  });
}

export async function removePermission(permissionId: string): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getCtx();
    const perm = await db.documentPermission.findUnique({ where: { id: z.string().uuid().parse(permissionId) } });
    if (!perm) throw new NotFoundError("Permissão");
    const item = await requireItem(ctx, perm.folderId ? "folder" : "document", (perm.folderId ?? perm.documentId)!);
    await db.documentPermission.delete({ where: { id: perm.id } });
    await audit({ event: "share.revoke", result: "SUCCESS", userId: ctx.userId, organizationId: ctx.orgId, metadata: { permissionId } });
    revalidatePath(item.href);
    return ok(undefined, "Acesso removido.");
  });
}

/** Compartilha com um workspace inteiro (todos os membros atuais e futuros). */
export async function shareWithWorkspace(input: { kind: "folder" | "document"; id: string; workspaceId: string; role: Role }): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getCtx();
    const kind = kindSchema.parse(input.kind);
    const role = grantable.parse(input.role);
    const item = await requireItem(ctx, kind, z.string().uuid().parse(input.id));
    assertCanGrant(item.role, role);
    const { workspace } = await requireWorkspace(ctx, z.string().uuid().parse(input.workspaceId), "document.read");

    const existing = await db.documentShare.findFirst({ where: { ...item.where, workspaceId: workspace.id, revokedAt: null }, select: { id: true } });
    if (existing) await db.documentShare.update({ where: { id: existing.id }, data: { role } });
    else await db.documentShare.create({ data: { ...item.where, scope: "WORKSPACE", workspaceId: workspace.id, role, createdById: ctx.userId } });

    const members = await db.workspaceMember.findMany({ where: { workspaceId: workspace.id }, select: { userId: true } });
    await notify({
      organizationId: ctx.orgId,
      userIds: members.map((m) => m.userId),
      exceptUserId: ctx.userId,
      type: "DOCUMENT_SHARED",
      title: `"${item.title}" foi compartilhado com ${workspace.name}`,
      href: item.href,
    });
    await audit({ event: "share.workspace", result: "SUCCESS", userId: ctx.userId, organizationId: ctx.orgId, metadata: { kind, role, workspaceId: workspace.id } });
    revalidatePath(item.href);
    return ok(undefined, `Compartilhado com ${workspace.name}.`);
  });
}

export async function revokeShare(shareId: string): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getCtx();
    const share = await db.documentShare.findUnique({ where: { id: z.string().uuid().parse(shareId) } });
    if (!share) throw new NotFoundError("Compartilhamento");
    const item = await requireItem(ctx, share.folderId ? "folder" : "document", (share.folderId ?? share.documentId)!);
    await db.documentShare.update({ where: { id: share.id }, data: { revokedAt: new Date() } });
    await audit({ event: "share.revoke", result: "SUCCESS", userId: ctx.userId, organizationId: ctx.orgId, metadata: { shareId } });
    revalidatePath(item.href);
    return ok(undefined, "Compartilhamento removido.");
  });
}

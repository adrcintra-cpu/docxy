import "server-only";
import type { Prisma, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { can, highestRole, type Action } from "@/lib/auth/permissions";
import { ForbiddenError, getActiveMembership, requireUser } from "@/lib/auth/session";
import { NotFoundError } from "@/lib/errors";

/**
 * Modelo de acesso a pastas e documentos
 *
 * - Item SEM workspace é privado: vê quem criou, quem recebeu permissão explícita
 *   ou compartilhamento, e administradores da organização.
 * - Item EM workspace ativo: todos os membros do workspace, com o papel que têm nele.
 * - Permissões e compartilhamentos de uma pasta valem para tudo o que está dentro dela.
 * - O papel efetivo é o MAIOR entre todas essas fontes (highestRole).
 * Tudo é verificado aqui, no servidor, antes de qualquer leitura ou alteração.
 */

export interface Ctx {
  userId: string;
  userName: string;
  orgId: string;
  orgName: string;
  orgRole: Role;
}

export async function getCtx(): Promise<Ctx> {
  const user = await requireUser();
  const membership = await getActiveMembership(user.id);
  if (!membership) throw new ForbiddenError("document.read");
  return {
    userId: user.id,
    userName: user.name ?? user.email,
    orgId: membership.organizationId,
    orgName: membership.organization.name,
    orgRole: membership.role,
  };
}

/** Compartilhamento válido para o usuário: direto ou por um workspace ativo do qual ele é membro. */
export function activeShareWhere(userId: string): Prisma.DocumentShareWhereInput {
  return {
    revokedAt: null,
    AND: [
      { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      { OR: [{ targetUserId: userId }, { workspace: { active: true, deletedAt: null, members: { some: { userId } } } }] },
    ],
  };
}

/** Condições de acesso comuns a pastas e documentos (sem herança). */
function directAccess(userId: string) {
  return [
    { createdById: userId },
    { workspace: { active: true, deletedAt: null, members: { some: { userId } } } },
    { permissions: { some: { userId } } },
    { shares: { some: activeShareWhere(userId) } },
  ];
}

/** Pastas visíveis (acesso direto, ou herdado da pasta-mãe e da avó). */
export function folderVisibleWhere(ctx: Ctx): Prisma.FolderWhereInput {
  if (ctx.orgRole === "ADMIN") return { organizationId: ctx.orgId };
  const direct = directAccess(ctx.userId);
  return {
    organizationId: ctx.orgId,
    OR: [...direct, { parent: { OR: direct } }, { parent: { parent: { OR: direct } } }],
  };
}

/** Documentos visíveis (acesso direto, ou herdado da pasta e da pasta-mãe dela). */
export function documentVisibleWhere(ctx: Ctx): Prisma.DocumentWhereInput {
  if (ctx.orgRole === "ADMIN") return { organizationId: ctx.orgId };
  const direct = directAccess(ctx.userId);
  return {
    organizationId: ctx.orgId,
    OR: [...direct, { folder: { OR: direct } }, { folder: { parent: { OR: direct } } }],
  };
}

const accessInclude = (userId: string) => ({
  workspace: { select: { active: true, deletedAt: true, members: { where: { userId }, select: { role: true } } } },
  permissions: { where: { userId }, select: { role: true } },
  shares: { where: activeShareWhere(userId), select: { role: true } },
});

type AccessRow = {
  createdById: string;
  workspace: { active: boolean; deletedAt: Date | null; members: { role: Role }[] } | null;
  permissions: { role: Role }[];
  shares: { role: Role }[];
};

function rolesFrom(row: AccessRow, userId: string): (Role | null)[] {
  const ws = row.workspace && row.workspace.active && !row.workspace.deletedAt ? row.workspace.members[0]?.role : null;
  return [
    row.createdById === userId ? "OWNER" : null,
    ws ?? null,
    ...row.permissions.map((p) => p.role),
    ...row.shares.map((s) => s.role),
  ];
}

/** Papel efetivo do usuário numa pasta, somando todas as pastas acima dela. */
export async function folderRole(ctx: Ctx, folderId: string | null): Promise<Role | null> {
  const roles: (Role | null)[] = [ctx.orgRole === "ADMIN" ? "ADMIN" : null];
  let current = folderId;
  for (let depth = 0; current && depth < 32; depth++) {
    const folder = await db.folder.findFirst({
      where: { id: current, organizationId: ctx.orgId },
      select: { parentId: true, createdById: true, ...accessInclude(ctx.userId) },
    });
    if (!folder) break;
    roles.push(...rolesFrom(folder, ctx.userId));
    current = folder.parentId;
  }
  return highestRole(...roles);
}

async function documentRole(ctx: Ctx, doc: AccessRow & { folderId: string | null }) {
  return highestRole(...rolesFrom(doc, ctx.userId), await folderRole(ctx, doc.folderId));
}

async function deny(ctx: Ctx, action: Action, meta: Record<string, string>): Promise<never> {
  await audit({ event: "permission.denied", result: "DENIED", userId: ctx.userId, organizationId: ctx.orgId, metadata: { action, ...meta } });
  throw new ForbiddenError(action);
}

/** Carrega a pasta e garante a permissão. Itens de outra organização respondem como inexistentes. */
export async function requireFolder(ctx: Ctx, id: string, action: Action, opts: { includeDeleted?: boolean } = {}) {
  const folder = await db.folder.findFirst({
    where: { id, organizationId: ctx.orgId, ...(opts.includeDeleted ? {} : { deletedAt: null }) },
  });
  if (!folder) throw new NotFoundError("Pasta");
  const role = await folderRole(ctx, id);
  if (!role) throw new NotFoundError("Pasta");
  if (!can(role, action)) await deny(ctx, action, { folderId: id });
  return { folder, role: role! };
}

export async function requireDocument(ctx: Ctx, id: string, action: Action, opts: { includeDeleted?: boolean } = {}) {
  const document = await db.document.findFirst({
    where: { id, organizationId: ctx.orgId, ...(opts.includeDeleted ? {} : { deletedAt: null }) },
    include: accessInclude(ctx.userId),
  });
  if (!document) throw new NotFoundError("Documento");
  const role = highestRole(ctx.orgRole === "ADMIN" ? "ADMIN" : null, await documentRole(ctx, document));
  if (!role) throw new NotFoundError("Documento");
  if (!can(role, action)) await deny(ctx, action, { documentId: id });
  return { document, role: role! };
}

/** Papel no workspace (administrador da organização conta como ADMIN em todos). */
export async function workspaceRole(ctx: Ctx, workspaceId: string): Promise<Role | null> {
  if (ctx.orgRole === "ADMIN") return "ADMIN";
  const member = await db.workspaceMember.findFirst({
    where: { workspaceId, userId: ctx.userId, workspace: { organizationId: ctx.orgId, deletedAt: null } },
    select: { role: true },
  });
  return member?.role ?? null;
}

export async function requireWorkspace(ctx: Ctx, id: string, action: Action) {
  const workspace = await db.workspace.findFirst({ where: { id, organizationId: ctx.orgId, deletedAt: null } });
  if (!workspace) throw new NotFoundError("Workspace");
  const role = await workspaceRole(ctx, id);
  if (!role) throw new NotFoundError("Workspace");
  if (!can(role, action)) await deny(ctx, action, { workspaceId: id });
  // Workspace desativado: só quem o gerencia continua entrando (para reativar).
  if (!workspace.active && !can(role, "workspace.manage")) throw new NotFoundError("Workspace");
  return { workspace, role };
}

/** Todas as pastas abaixo de uma pasta (BFS), para mover ou enviar à lixeira em conjunto. */
export async function descendantFolderIds(rootId: string, organizationId: string): Promise<string[]> {
  const out: string[] = [];
  let frontier = [rootId];
  for (let depth = 0; frontier.length && depth < 32; depth++) {
    const children = await db.folder.findMany({
      where: { parentId: { in: frontier }, organizationId },
      select: { id: true },
    });
    frontier = children.map((c) => c.id);
    out.push(...frontier);
  }
  return out;
}

/** Campos necessários para calcular o papel direto de uma linha (use em `select`/`include`). */
export function accessFields(userId: string) {
  return { createdById: true, ...accessInclude(userId) } as const;
}

/** Papel direto de uma linha já carregada com accessFields, combinado com um papel herdado. */
export function roleOf(ctx: Ctx, row: AccessRow, inherited: Role | null = null): Role | null {
  return highestRole(ctx.orgRole === "ADMIN" ? "ADMIN" : null, inherited, ...rolesFrom(row, ctx.userId));
}

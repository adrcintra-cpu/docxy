"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { can } from "@/lib/auth/permissions";
import { ForbiddenError } from "@/lib/auth/session";
import { guard, ok } from "@/lib/actions";
import { UserError, type ActionResult } from "@/lib/errors";
import {
  descendantFolderIds,
  getCtx,
  requireDocument,
  requireFolder,
  requireWorkspace,
  type Ctx,
} from "@/lib/access";

const id = z.string().uuid("Item inválido.");
const name = z
  .string()
  .trim()
  .min(1, "Informe um nome.")
  .max(120, "Use no máximo 120 caracteres.")
  .refine((v) => !/[\\/<>:"|?*\u0000-\u001f]/.test(v), "O nome não pode conter / \\ < > : \" | ? *");

function refresh(...paths: (string | null | undefined)[]) {
  revalidatePath("/", "layout");
  for (const p of paths) if (p) revalidatePath(p);
}

// ─── Pastas ─────────────────────────────────────────────────────────────

export async function createFolder(input: {
  name: string;
  parentId?: string | null;
  workspaceId?: string | null;
  isWorkFolder?: boolean;
  description?: string;
}): Promise<ActionResult<{ id: string }>> {
  return guard(async () => {
    const ctx = await getCtx();
    const folderName = name.parse(input.name);
    let workspaceId: string | null = null;
    let parentId: string | null = null;

    if (input.parentId) {
      const { folder } = await requireFolder(ctx, id.parse(input.parentId), "folder.create");
      parentId = folder.id;
      workspaceId = folder.workspaceId; // subpasta herda o workspace
    } else if (input.workspaceId) {
      await requireWorkspace(ctx, id.parse(input.workspaceId), "folder.create");
      workspaceId = input.workspaceId;
    } else if (!can(ctx.orgRole, "folder.create")) {
      throw new ForbiddenError("folder.create");
    }

    const exists = await db.folder.findFirst({
      where: { organizationId: ctx.orgId, parentId, workspaceId, name: { equals: folderName, mode: "insensitive" }, deletedAt: null },
      select: { id: true },
    });
    if (exists) throw new UserError("Já existe uma pasta com esse nome aqui.");

    const folder = await db.folder.create({
      data: {
        organizationId: ctx.orgId,
        workspaceId,
        parentId,
        name: folderName,
        description: input.description?.trim().slice(0, 2000) || null,
        isWorkFolder: input.isWorkFolder ?? !parentId,
        createdById: ctx.userId,
      },
    });
    await audit({ event: "folder.create", result: "SUCCESS", userId: ctx.userId, organizationId: ctx.orgId, metadata: { folderId: folder.id } });
    refresh(parentId ? `/pastas/${parentId}` : null);
    return ok({ id: folder.id }, "Pasta criada.");
  });
}

export async function renameFolder(folderId: string, newName: string): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getCtx();
    const { folder } = await requireFolder(ctx, id.parse(folderId), "folder.manage");
    await db.folder.update({ where: { id: folder.id }, data: { name: name.parse(newName) } });
    await audit({ event: "folder.rename", result: "SUCCESS", userId: ctx.userId, organizationId: ctx.orgId, metadata: { folderId } });
    refresh(`/pastas/${folder.id}`);
    return ok(undefined, "Pasta renomeada.");
  });
}

export async function updateFolderDescription(folderId: string, description: string): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getCtx();
    const { folder } = await requireFolder(ctx, id.parse(folderId), "folder.manage");
    await db.folder.update({ where: { id: folder.id }, data: { description: description.trim().slice(0, 2000) || null } });
    refresh(`/pastas/${folder.id}`);
    return ok(undefined, "Descrição salva.");
  });
}

/** Workspace de destino ao mover para dentro de uma pasta (ou para a raiz, mantendo o atual). */
async function targetFolder(ctx: Ctx, targetId: string | null | undefined) {
  if (!targetId) return null;
  const { folder } = await requireFolder(ctx, id.parse(targetId), "document.upload");
  return folder;
}

export async function moveFolder(folderId: string, targetParentId: string | null): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getCtx();
    const { folder } = await requireFolder(ctx, id.parse(folderId), "folder.manage");
    const target = await targetFolder(ctx, targetParentId);

    const descendants = await descendantFolderIds(folder.id, ctx.orgId);
    if (target && (target.id === folder.id || descendants.includes(target.id))) {
      throw new UserError("Não é possível mover uma pasta para dentro dela mesma.");
    }
    const workspaceId = target ? target.workspaceId : folder.workspaceId;
    const all = [folder.id, ...descendants];

    await db.$transaction([
      db.folder.update({ where: { id: folder.id }, data: { parentId: target?.id ?? null } }),
      db.folder.updateMany({ where: { id: { in: all } }, data: { workspaceId } }),
      db.document.updateMany({ where: { folderId: { in: all } }, data: { workspaceId } }),
    ]);
    await audit({ event: "folder.move", result: "SUCCESS", userId: ctx.userId, organizationId: ctx.orgId, metadata: { folderId, to: target?.id ?? "root" } });
    refresh(folder.parentId ? `/pastas/${folder.parentId}` : null, target ? `/pastas/${target.id}` : null);
    return ok(undefined, "Pasta movida.");
  });
}

/** Envia a pasta, as subpastas e os documentos para a lixeira (exclusão lógica, reversível). */
export async function trashFolder(folderId: string): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getCtx();
    const { folder } = await requireFolder(ctx, id.parse(folderId), "folder.manage");
    const all = [folder.id, ...(await descendantFolderIds(folder.id, ctx.orgId))];
    const now = new Date();
    await db.$transaction([
      db.folder.updateMany({ where: { id: { in: all }, deletedAt: null }, data: { deletedAt: now } }),
      db.document.updateMany({ where: { folderId: { in: all }, deletedAt: null }, data: { deletedAt: now } }),
    ]);
    await audit({ event: "folder.trash", result: "SUCCESS", userId: ctx.userId, organizationId: ctx.orgId, metadata: { folderId } });
    refresh(folder.parentId ? `/pastas/${folder.parentId}` : null, "/lixeira");
    return ok(undefined, "Pasta enviada para a lixeira.");
  });
}

export async function restoreFolder(folderId: string): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getCtx();
    const { folder } = await requireFolder(ctx, id.parse(folderId), "folder.manage", { includeDeleted: true });
    if (!folder.deletedAt) return ok(undefined, "A pasta já está ativa.");
    const all = [folder.id, ...(await descendantFolderIds(folder.id, ctx.orgId))];
    // Restaura só o que foi para a lixeira junto com esta pasta.
    const parent = folder.parentId ? await db.folder.findUnique({ where: { id: folder.parentId }, select: { deletedAt: true } }) : null;
    await db.$transaction([
      db.folder.updateMany({ where: { id: { in: all }, deletedAt: folder.deletedAt }, data: { deletedAt: null } }),
      db.document.updateMany({ where: { folderId: { in: all }, deletedAt: folder.deletedAt }, data: { deletedAt: null } }),
      // Se a pasta-mãe continua na lixeira, a pasta volta para a raiz.
      ...(parent?.deletedAt ? [db.folder.update({ where: { id: folder.id }, data: { parentId: null } })] : []),
    ]);
    await audit({ event: "folder.restore", result: "SUCCESS", userId: ctx.userId, organizationId: ctx.orgId, metadata: { folderId } });
    refresh("/lixeira");
    return ok(undefined, "Pasta restaurada.");
  });
}

// ─── Documentos ─────────────────────────────────────────────────────────

export async function renameDocument(documentId: string, newTitle: string): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getCtx();
    const { document } = await requireDocument(ctx, id.parse(documentId), "document.edit");
    await db.document.update({ where: { id: document.id }, data: { title: name.parse(newTitle) } });
    await audit({ event: "document.rename", result: "SUCCESS", userId: ctx.userId, organizationId: ctx.orgId, documentId });
    refresh(`/documentos/${document.id}`, document.folderId ? `/pastas/${document.folderId}` : null);
    return ok(undefined, "Documento renomeado.");
  });
}

export async function updateDocumentDetails(documentId: string, input: { description?: string; tags?: string[] }): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getCtx();
    const { document } = await requireDocument(ctx, id.parse(documentId), "document.edit");
    const tags = input.tags
      ? [...new Set(input.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20).map((t) => t.slice(0, 40))
      : undefined;
    await db.document.update({
      where: { id: document.id },
      data: { description: input.description !== undefined ? input.description.trim().slice(0, 2000) || null : undefined, tags },
    });
    refresh(`/documentos/${document.id}`);
    return ok(undefined, "Detalhes salvos.");
  });
}

export async function moveDocument(documentId: string, targetFolderId: string | null): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getCtx();
    const { document } = await requireDocument(ctx, id.parse(documentId), "document.edit");
    const target = await targetFolder(ctx, targetFolderId);
    await db.document.update({
      where: { id: document.id },
      data: { folderId: target?.id ?? null, workspaceId: target ? target.workspaceId : document.workspaceId },
    });
    await audit({ event: "document.move", result: "SUCCESS", userId: ctx.userId, organizationId: ctx.orgId, documentId, metadata: { to: target?.id ?? "root" } });
    refresh(document.folderId ? `/pastas/${document.folderId}` : null, target ? `/pastas/${target.id}` : null, `/documentos/${document.id}`);
    return ok(undefined, "Documento movido.");
  });
}

export async function trashDocument(documentId: string): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getCtx();
    const { document } = await requireDocument(ctx, id.parse(documentId), "document.delete");
    await db.document.update({ where: { id: document.id }, data: { deletedAt: new Date() } });
    await audit({ event: "document.trash", result: "SUCCESS", userId: ctx.userId, organizationId: ctx.orgId, documentId });
    refresh(document.folderId ? `/pastas/${document.folderId}` : null, "/lixeira");
    return ok(undefined, "Documento enviado para a lixeira.");
  });
}

export async function restoreDocument(documentId: string): Promise<ActionResult> {
  return guard(async () => {
    const ctx = await getCtx();
    const { document } = await requireDocument(ctx, id.parse(documentId), "document.delete", { includeDeleted: true });
    const folder = document.folderId ? await db.folder.findUnique({ where: { id: document.folderId }, select: { deletedAt: true } }) : null;
    await db.document.update({
      where: { id: document.id },
      // Se a pasta continua na lixeira, o documento volta para a raiz.
      data: { deletedAt: null, ...(folder?.deletedAt ? { folderId: null } : {}) },
    });
    await audit({ event: "document.restore", result: "SUCCESS", userId: ctx.userId, organizationId: ctx.orgId, documentId });
    refresh("/lixeira");
    return ok(undefined, "Documento restaurado.");
  });
}

// ─── Fixados ────────────────────────────────────────────────────────────

export async function togglePin(kind: "folder" | "document", itemId: string): Promise<ActionResult<{ pinned: boolean }>> {
  return guard(async () => {
    const ctx = await getCtx();
    const target = id.parse(itemId);
    if (kind === "folder") await requireFolder(ctx, target, "document.read");
    else await requireDocument(ctx, target, "document.read");

    const where = kind === "folder" ? { userId: ctx.userId, folderId: target } : { userId: ctx.userId, documentId: target };
    const existing = await db.pin.findFirst({ where, select: { id: true } });
    if (existing) await db.pin.delete({ where: { id: existing.id } });
    else await db.pin.create({ data: where });
    refresh();
    return ok({ pinned: !existing }, existing ? "Removido dos fixados." : "Fixado.");
  });
}

export async function updateDocumentDescription(documentId: string, description: string): Promise<ActionResult> {
  return updateDocumentDetails(documentId, { description });
}

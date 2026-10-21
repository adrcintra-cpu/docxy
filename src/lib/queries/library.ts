import "server-only";
import type { Prisma, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import { accessFields, documentVisibleWhere, folderRole, folderVisibleWhere, roleOf, type Ctx } from "@/lib/access";
import type { FolderOption, ItemPermissions } from "@/components/documents/item-actions";

export type SortKey = "recentes" | "nome" | "tamanho";
export interface LibraryFilters {
  q?: string;
  sort?: SortKey;
  type?: "pdf" | "docx";
  pinned?: boolean;
}

export interface Person {
  id: string;
  name: string;
}

export interface FolderItem {
  id: string;
  name: string;
  isWorkFolder: boolean;
  parentId: string | null;
  workspaceName: string | null;
  docCount: number;
  totalBytes: number;
  preview: { id: string; title: string }[];
  people: Person[];
  pinned: boolean;
  permissions: ItemPermissions;
  updatedAt: Date;
}

export interface DocumentItem {
  id: string;
  title: string;
  folderId: string | null;
  folderName: string | null;
  fileName: string | null;
  ext: "pdf" | "docx" | null;
  versionId: string | null;
  versionNumber: number | null;
  sizeBytes: number;
  status: "UPLOADING" | "PROCESSING" | "READY" | "FAILED";
  createdAt: Date;
  lastViewedAt: Date | null;
  versionCount: number;
  pinned: boolean;
  permissions: ItemPermissions;
  updatedAt: Date;
}

export const folderPerms = (role: Role | null): ItemPermissions => ({
  manage: can(role, "folder.manage"),
  remove: can(role, "folder.manage"),
  share: can(role, "document.share"),
});

export const documentPerms = (role: Role | null): ItemPermissions => ({
  manage: can(role, "document.edit"),
  remove: can(role, "document.delete"),
  share: can(role, "document.share"),
});

const documentSelect = (userId: string) =>
  ({
    id: true,
    title: true,
    folderId: true,
    status: true,
    createdAt: true,
    updatedAt: true,
    folder: { select: { name: true } },
    currentVersion: { select: { id: true, versionNumber: true, sizeBytes: true, fileName: true, lastViewedAt: true } },
    _count: { select: { versions: { where: { stage: { notIn: ["UPLOADING", "FAILED"] } } } } },
    ...accessFields(userId),
  }) satisfies Prisma.DocumentSelect;

type DocumentRow = Prisma.DocumentGetPayload<{ select: ReturnType<typeof documentSelect> }>;

function toDocumentItem(row: DocumentRow, role: Role | null, pinned: Set<string>): DocumentItem {
  const v = row.currentVersion;
  const ext = v?.fileName.toLowerCase().endsWith(".docx") ? "docx" : v ? "pdf" : null;
  return {
    id: row.id,
    title: row.title,
    folderId: row.folderId,
    folderName: row.folder?.name ?? null,
    fileName: v?.fileName ?? null,
    ext,
    versionId: v?.id ?? null,
    versionNumber: v?.versionNumber ?? null,
    sizeBytes: v ? Number(v.sizeBytes) : 0,
    status: row.status,
    createdAt: row.createdAt,
    lastViewedAt: v?.lastViewedAt ?? null,
    versionCount: row._count.versions,
    pinned: pinned.has(row.id),
    permissions: documentPerms(role),
    updatedAt: row.updatedAt,
  };
}

const folderSelect = (userId: string) =>
  ({
    id: true,
    name: true,
    isWorkFolder: true,
    parentId: true,
    updatedAt: true,
    workspace: {
      select: {
        name: true,
        active: true,
        deletedAt: true,
        members: { select: { role: true, userId: true, user: { select: { id: true, name: true, email: true } } }, take: 8 },
      },
    },
    createdBy: { select: { id: true, name: true, email: true } },
    createdById: true,
    permissions: { select: { role: true, userId: true, user: { select: { id: true, name: true, email: true } } } },
    shares: {
      where: { revokedAt: null },
      select: {
        role: true,
        targetUserId: true,
        expiresAt: true,
        workspace: { select: { active: true, deletedAt: true, members: { where: { userId }, select: { userId: true } } } },
      },
    },
  }) satisfies Prisma.FolderSelect;

type FolderRow = Prisma.FolderGetPayload<{ select: ReturnType<typeof folderSelect> }>;

/** Papel direto numa pasta já carregada com folderSelect (filtra as linhas que são do usuário). */
function folderRowRole(ctx: Ctx, row: FolderRow, inherited: Role | null) {
  const now = new Date();
  return roleOf(
    ctx,
    {
      createdById: row.createdById,
      workspace: row.workspace
        ? { active: row.workspace.active, deletedAt: row.workspace.deletedAt, members: row.workspace.members.filter((m) => m.userId === ctx.userId) }
        : null,
      permissions: row.permissions.filter((p) => p.userId === ctx.userId),
      shares: row.shares.filter(
        (s) =>
          (!s.expiresAt || s.expiresAt > now) &&
          (s.targetUserId === ctx.userId || (s.workspace?.active && !s.workspace.deletedAt && s.workspace.members.length > 0)),
      ),
    },
    inherited,
  );
}

const personName = (u: { id: string; name: string | null; email: string }): Person => ({ id: u.id, name: u.name ?? u.email });

async function hydrateFolders(ctx: Ctx, rows: FolderRow[], inherited: (row: FolderRow) => Promise<Role | null> | Role | null, pinned: Set<string>) {
  const ids = rows.map((r) => r.id);
  const docs = ids.length
    ? await db.document.findMany({
        where: { folderId: { in: ids }, deletedAt: null, status: { not: "UPLOADING" } },
        orderBy: { updatedAt: "desc" },
        select: { id: true, title: true, folderId: true, currentVersion: { select: { sizeBytes: true } } },
      })
    : [];
  return Promise.all(
    rows.map(async (row): Promise<FolderItem> => {
      const mine = docs.filter((d) => d.folderId === row.id);
      const people = new Map<string, Person>();
      people.set(row.createdBy.id, personName(row.createdBy));
      for (const m of row.workspace?.members ?? []) people.set(m.user.id, personName(m.user));
      for (const p of row.permissions) people.set(p.user.id, personName(p.user));
      return {
        id: row.id,
        name: row.name,
        isWorkFolder: row.isWorkFolder,
        parentId: row.parentId,
        workspaceName: row.workspace && !row.workspace.deletedAt ? row.workspace.name : null,
        docCount: mine.length,
        totalBytes: mine.reduce((sum, d) => sum + Number(d.currentVersion?.sizeBytes ?? 0), 0),
        preview: mine.slice(0, 5).map((d) => ({ id: d.id, title: d.title })),
        people: [...people.values()],
        pinned: pinned.has(row.id),
        permissions: folderPerms(folderRowRole(ctx, row, await inherited(row))),
        updatedAt: row.updatedAt,
      };
    }),
  );
}

async function pinnedSets(userId: string) {
  const pins = await db.pin.findMany({ where: { userId }, select: { folderId: true, documentId: true } });
  return {
    folders: new Set(pins.map((p) => p.folderId).filter((v): v is string => !!v)),
    documents: new Set(pins.map((p) => p.documentId).filter((v): v is string => !!v)),
  };
}

function orderBy(sort: SortKey | undefined) {
  return sort === "nome" ? ({ name: "asc" } as const) : ({ updatedAt: "desc" } as const);
}

/** Início: pastas e documentos da raiz, ou resultados de pesquisa em qualquer nível. */
export async function getLibrary(ctx: Ctx, filters: LibraryFilters) {
  const pins = await pinnedSets(ctx.userId);
  const q = filters.q?.trim();
  const searching = Boolean(q);

  const folderWhere: Prisma.FolderWhereInput = {
    AND: [
      folderVisibleWhere(ctx),
      { deletedAt: null },
      searching ? { name: { contains: q, mode: "insensitive" } } : { parentId: null },
      filters.pinned ? { id: { in: [...pins.folders] } } : {},
    ],
  };
  const documentWhere: Prisma.DocumentWhereInput = {
    AND: [
      documentVisibleWhere(ctx),
      { deletedAt: null, status: { not: "UPLOADING" } },
      searching
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { tags: { has: q!.toLowerCase() } },
              { description: { contains: q, mode: "insensitive" } },
              // Conteúdo: texto extraído da versão atual (Fase 3).
              { currentVersion: { pages: { some: { text: { contains: q, mode: "insensitive" } } } } },
            ],
          }
        : { folderId: null },
      filters.pinned ? { id: { in: [...pins.documents] } } : {},
      filters.type ? { currentVersion: { fileName: { endsWith: `.${filters.type}`, mode: "insensitive" } } } : {},
    ],
  };

  const [folderRows, docRows] = await Promise.all([
    filters.type ? Promise.resolve([] as FolderRow[]) : db.folder.findMany({ where: folderWhere, orderBy: orderBy(filters.sort), take: 60, select: folderSelect(ctx.userId) }),
    db.document.findMany({
      where: documentWhere,
      orderBy: filters.sort === "nome" ? { title: "asc" } : { updatedAt: "desc" },
      take: 100,
      select: documentSelect(ctx.userId),
    }),
  ]);

  // Em pesquisa, itens em subpastas herdam o papel da pasta-mãe.
  const folders = await hydrateFolders(ctx, folderRows, (row) => (row.parentId ? folderRole(ctx, row.parentId) : null), pins.folders);
  const documents = await Promise.all(
    docRows.map(async (row) => toDocumentItem(row, roleOf(ctx, row, row.folderId ? await folderRole(ctx, row.folderId) : null), pins.documents)),
  );

  if (filters.sort === "tamanho") {
    folders.sort((a, b) => b.totalBytes - a.totalBytes);
    documents.sort((a, b) => b.sizeBytes - a.sizeBytes);
  }
  return { folders, documents };
}

/** Conteúdo de uma pasta: quem pode ver a pasta vê tudo o que está dentro. */
export async function getFolderContents(ctx: Ctx, folderId: string, folderRoleValue: Role) {
  const pins = await pinnedSets(ctx.userId);
  const [folderRows, docRows] = await Promise.all([
    db.folder.findMany({ where: { parentId: folderId, deletedAt: null }, orderBy: { name: "asc" }, select: folderSelect(ctx.userId) }),
    db.document.findMany({
      where: { folderId, deletedAt: null, status: { not: "UPLOADING" } },
      orderBy: { updatedAt: "desc" },
      select: documentSelect(ctx.userId),
    }),
  ]);
  return {
    folders: await hydrateFolders(ctx, folderRows, () => folderRoleValue, pins.folders),
    documents: docRows.map((row) => toDocumentItem(row, roleOf(ctx, row, folderRoleValue), pins.documents)),
  };
}

/** Destinos possíveis para "Mover": pastas visíveis, com o caminho completo no rótulo. */
export async function getMoveTargets(ctx: Ctx): Promise<FolderOption[]> {
  const rows = await db.folder.findMany({
    where: { AND: [folderVisibleWhere(ctx), { deletedAt: null }] },
    select: { id: true, name: true, parentId: true },
    take: 300,
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const path = (id: string): string => {
    const parts: string[] = [];
    let cur = byId.get(id);
    for (let i = 0; cur && i < 10; i++) {
      parts.unshift(cur.name);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return parts.join(" / ");
  };
  return rows.map((r) => ({ id: r.id, label: path(r.id) })).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

/** Workspaces onde o usuário pode criar pastas. */
export async function getCreatableWorkspaces(ctx: Ctx): Promise<FolderOption[]> {
  const rows = await db.workspace.findMany({
    where: {
      organizationId: ctx.orgId,
      active: true,
      deletedAt: null,
      ...(ctx.orgRole === "ADMIN" ? {} : { members: { some: { userId: ctx.userId, role: { in: ["WRITER", "EDITOR", "OWNER", "ADMIN"] } } } }),
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return rows.map((r) => ({ id: r.id, label: r.name }));
}

/** Itens compartilhados diretamente com o usuário (permissão explícita ou compartilhamento). */
export async function getSharedWithMe(ctx: Ctx) {
  const pins = await pinnedSets(ctx.userId);
  const direct = {
    OR: [
      { permissions: { some: { userId: ctx.userId } } },
      { shares: { some: { targetUserId: ctx.userId, revokedAt: null } } },
    ],
  };
  const [folderRows, docRows] = await Promise.all([
    db.folder.findMany({
      where: { organizationId: ctx.orgId, deletedAt: null, createdById: { not: ctx.userId }, ...direct },
      orderBy: { updatedAt: "desc" },
      take: 60,
      select: folderSelect(ctx.userId),
    }),
    db.document.findMany({
      where: { organizationId: ctx.orgId, deletedAt: null, status: { not: "UPLOADING" }, createdById: { not: ctx.userId }, ...direct },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: documentSelect(ctx.userId),
    }),
  ]);
  return {
    folders: await hydrateFolders(ctx, folderRows, () => null, pins.folders),
    documents: docRows.map((row) => toDocumentItem(row, roleOf(ctx, row), pins.documents)),
  };
}

/** Lixeira: itens excluídos que o usuário pode restaurar. */
export async function getTrash(ctx: Ctx) {
  const [folderRows, docRows] = await Promise.all([
    db.folder.findMany({
      where: { AND: [folderVisibleWhere(ctx), { deletedAt: { not: null } }] },
      orderBy: { deletedAt: "desc" },
      take: 100,
      select: { ...folderSelect(ctx.userId), deletedAt: true },
    }),
    db.document.findMany({
      where: { AND: [documentVisibleWhere(ctx), { deletedAt: { not: null } }] },
      orderBy: { deletedAt: "desc" },
      take: 200,
      select: { ...documentSelect(ctx.userId), deletedAt: true },
    }),
  ]);
  const folders = await Promise.all(
    folderRows.map(async (row) => ({
      id: row.id,
      name: row.name,
      deletedAt: row.deletedAt!,
      canRestore: can(folderRowRole(ctx, row, row.parentId ? await folderRole(ctx, row.parentId) : null), "folder.manage"),
    })),
  );
  const documents = await Promise.all(
    docRows.map(async (row) => ({
      id: row.id,
      title: row.title,
      folderId: row.folderId,
      folderName: row.folder?.name ?? null,
      deletedAt: row.deletedAt!,
      canRestore: can(roleOf(ctx, row, row.folderId ? await folderRole(ctx, row.folderId) : null), "document.delete"),
    })),
  );
  // Documentos que foram para a lixeira junto com a pasta voltam com ela: não aparecem soltos.
  const trashedFolders = new Set(folderRows.map((f) => f.id));
  return {
    folders: folders.filter((f) => f.canRestore),
    documents: documents.filter((d) => d.canRestore && !(d.folderId && trashedFolders.has(d.folderId))),
  };
}

/** Registra o acesso a uma pasta ou documento (menu "Recentes"). */
export async function touchRecent(userId: string, item: { folderId?: string; documentId?: string }) {
  try {
    if (item.folderId) {
      await db.recentItem.upsert({
        where: { userId_folderId: { userId, folderId: item.folderId } },
        update: { accessedAt: new Date() },
        create: { userId, folderId: item.folderId },
      });
    } else if (item.documentId) {
      await db.recentItem.upsert({
        where: { userId_documentId: { userId, documentId: item.documentId } },
        update: { accessedAt: new Date() },
        create: { userId, documentId: item.documentId },
      });
    }
  } catch {
    // Recentes é conveniência: falha aqui nunca impede abrir o item.
  }
}

/** Dados do bloco "Compartilhado": quem criou, permissões explícitas e workspaces. */
export async function getShareInfo(ctx: Ctx, where: { folderId: string } | { documentId: string }) {
  const [permissions, shares] = await Promise.all([
    db.documentPermission.findMany({
      where,
      orderBy: { createdAt: "asc" },
      select: { id: true, role: true, user: { select: { id: true, name: true, email: true } } },
    }),
    db.documentShare.findMany({
      where: { ...where, scope: "WORKSPACE", revokedAt: null },
      select: { id: true, role: true, workspace: { select: { name: true } } },
    }),
  ]);
  const workspaces = await db.workspace.findMany({
    where: { organizationId: ctx.orgId, active: true, deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return {
    people: permissions.map((p) => ({ permissionId: p.id, userId: p.user.id, name: p.user.name ?? p.user.email, role: p.role })),
    workspaceShares: shares.map((s) => ({ shareId: s.id, name: s.workspace?.name ?? "Workspace", role: s.role })),
    workspaces: workspaces.map((w) => ({ id: w.id, label: w.name })),
  };
}

/** Caminho de pastas até a raiz, para o "Voltar" e a trilha de navegação. */
export async function getBreadcrumb(organizationId: string, folderId: string | null) {
  const trail: { id: string; name: string }[] = [];
  let current = folderId;
  for (let i = 0; current && i < 32; i++) {
    const f = await db.folder.findFirst({ where: { id: current, organizationId }, select: { id: true, name: true, parentId: true } });
    if (!f) break;
    trail.unshift({ id: f.id, name: f.name });
    current = f.parentId;
  }
  return trail;
}

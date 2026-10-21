import "server-only";
import { db } from "@/lib/db";
import type { SidebarItem } from "@/components/layout/sidebar";

/**
 * Itens fixados e recentes do usuário na organização ativa.
 * Só retorna pastas/documentos não excluídos da própria organização
 * (o filtro fino por permissão de documento chega com o módulo de documentos, Fase 2).
 */
export async function getSidebarItems(userId: string, organizationId: string) {
  const [pins, recents] = await Promise.all([
    db.pin.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 10 }),
    db.recentItem.findMany({ where: { userId }, orderBy: { accessedAt: "desc" }, take: 10 }),
  ]);

  const docIds = [...pins, ...recents].map((p) => p.documentId).filter((v): v is string => !!v);
  const folderIds = [...pins, ...recents].map((p) => p.folderId).filter((v): v is string => !!v);

  const [docs, folders] = await Promise.all([
    docIds.length
      ? db.document.findMany({
          where: { id: { in: docIds }, organizationId, deletedAt: null },
          select: { id: true, title: true, folder: { select: { name: true } } },
        })
      : [],
    folderIds.length
      ? db.folder.findMany({ where: { id: { in: folderIds }, organizationId, deletedAt: null }, select: { id: true, name: true } })
      : [],
  ]);
  const docMap = new Map(docs.map((d) => [d.id, d]));
  const folderMap = new Map(folders.map((f) => [f.id, f]));

  const toItem = (row: { id: string; documentId: string | null; folderId: string | null }): SidebarItem | null => {
    if (row.documentId) {
      const d = docMap.get(row.documentId);
      return d ? { id: row.id, kind: "document", name: d.title, subtitle: d.folder?.name, href: `/documentos/${d.id}` } : null;
    }
    if (row.folderId) {
      const f = folderMap.get(row.folderId);
      return f ? { id: row.id, kind: "folder", name: f.name, href: `/pastas/${f.id}` } : null;
    }
    return null;
  };

  return {
    pinned: pins.map(toItem).filter((v): v is SidebarItem => !!v),
    recent: recents.map(toItem).filter((v): v is SidebarItem => !!v),
  };
}

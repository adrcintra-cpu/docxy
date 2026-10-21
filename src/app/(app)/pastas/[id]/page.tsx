import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, FileSearch } from "lucide-react";
import { getCtx, requireFolder } from "@/lib/access";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { updateFolderDescription } from "@/app/actions/library";
import { getBreadcrumb, getFolderContents, getMoveTargets, getShareInfo, touchRecent } from "@/lib/queries/library";
import { readLibraryParams, type SearchParams } from "@/lib/queries/params";
import { formatBytes } from "@/lib/utils";
import { LibraryToolbar } from "@/components/documents/library-toolbar";
import { DocumentCard, DocumentTable, FolderCard, WorkFolderIcon } from "@/components/documents/library-views";
import { CreateFolderCard } from "@/components/documents/create-folder";
import { DescriptionEditor } from "@/components/documents/description-editor";
import { SharePanel } from "@/components/documents/share-panel";
import { UnavailableState } from "@/components/ui/card";

export const metadata: Metadata = { title: "Pasta" };

/** Detalhe da pasta (referência 04): painel Preview/Descrição/Compartilhado e tabela de arquivos. */
export default async function FolderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  const ctx = await getCtx();
  // Pasta na lista padrão é "Em lista", como na referência; ?view=icone mostra os cards.
  const sp = await searchParams;
  const { filters } = await readLibraryParams(searchParams);
  const view = sp.view === "icone" ? "icone" : "lista";

  let access;
  try {
    access = await requireFolder(ctx, id, "document.read");
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  const { folder, role } = access;

  const [contents, moveTargets, share, trail, owner] = await Promise.all([
    getFolderContents(ctx, folder.id, role),
    getMoveTargets(ctx),
    getShareInfo(ctx, { folderId: folder.id }),
    getBreadcrumb(ctx.orgId, folder.parentId),
    db.user.findUnique({ where: { id: folder.createdById }, select: { id: true, name: true, email: true } }),
    touchRecent(ctx.userId, { folderId: folder.id }),
  ]);
  const workspace = folder.workspaceId ? await db.workspace.findUnique({ where: { id: folder.workspaceId }, select: { name: true } }) : null;

  const q = filters.q?.toLowerCase();
  const folders = q ? contents.folders.filter((f) => f.name.toLowerCase().includes(q)) : contents.folders;
  const documents = contents.documents.filter(
    (d) => (!q || d.title.toLowerCase().includes(q) || d.fileName?.toLowerCase().includes(q)) && (!filters.type || d.ext === filters.type) && (!filters.pinned || d.pinned),
  );
  const totalBytes = contents.documents.reduce((s, d) => s + d.sizeBytes, 0);
  const canUpload = can(role, "document.upload");
  const base = `/pastas/${folder.id}`;

  return (
    <>
      <LibraryToolbar
        base={base}
        view={view}
        filters={filters}
        uploadFolderId={folder.id}
        uploadDisabledReason={canUpload ? undefined : "Seu perfil nesta pasta é só de visualização."}
        backHref={folder.parentId ? `/pastas/${folder.parentId}` : "/"}
        defaultView="lista"
      />

      <div className="grid flex-1 gap-6 lg:grid-cols-[320px_1fr]">
        <aside className="flex flex-col gap-6 self-start rounded-lg bg-surface p-6">
          <section className="flex flex-col gap-3">
            <h2 className="flex items-center gap-2 text-body-sm text-ink-muted">
              <FileSearch className="size-4" /> Preview
            </h2>
            <WorkFolderIcon className="h-[68px] w-[54px]" />
            <div>
              <h1 className="text-body font-medium">{folder.name}</h1>
              <p className="mt-1 text-body-sm text-ink-muted tabular-nums">
                {contents.documents.length} {contents.documents.length === 1 ? "fonte" : "fontes"} | {formatBytes(totalBytes)}
              </p>
            </div>
          </section>
          <div className="h-px bg-line/60" />
          <DescriptionEditor value={folder.description} canEdit={can(role, "folder.manage")} onSave={updateFolderDescription.bind(null, folder.id)} />
          <div className="h-px bg-line/60" />
          <SharePanel
            kind="folder"
            id={folder.id}
            owner={{ id: owner?.id ?? folder.createdById, name: owner?.name ?? owner?.email ?? "—" }}
            workspaceName={workspace?.name ?? null}
            people={share.people}
            workspaceShares={share.workspaceShares}
            workspaces={share.workspaces}
            canShare={can(role, "document.share")}
          />
        </aside>

        <section className="flex min-w-0 flex-col gap-5" aria-label={`Conteúdo de ${folder.name}`}>
          <nav aria-label="Caminho" className="flex flex-wrap items-center gap-1 text-body-sm text-ink-muted">
            <Link href="/" className="hover:text-ink">
              Início
            </Link>
            {trail.map((t) => (
              <span key={t.id} className="flex items-center gap-1">
                <ChevronRight className="size-4" />
                <Link href={`/pastas/${t.id}`} className="hover:text-ink">
                  {t.name}
                </Link>
              </span>
            ))}
            <ChevronRight className="size-4" />
            <span className="text-ink">{folder.name}</span>
          </nav>

          {view === "lista" ? (
            <>
              {folders.length + documents.length > 0 ? (
                <div className="rounded-lg px-2 lg:px-6">
                  <DocumentTable folders={folders} documents={documents} moveTargets={moveTargets} />
                </div>
              ) : (
                <UnavailableState
                  className="min-h-64"
                  title={q || filters.type || filters.pinned ? "Nada encontrado nesta pasta" : "Pasta vazia"}
                  description={canUpload ? "Use Upload arquivo para adicionar PDFs e DOCX." : undefined}
                />
              )}
              {can(role, "folder.create") && (
                <div>
                  <CreateFolderCard parentId={folder.id} label="Nova subpasta" className="min-h-0 flex-row gap-3 px-5 py-3 [&>span:first-child]:size-9 [&_svg]:size-5" />
                </div>
              )}
            </>
          ) : (
            <div className="grid auto-rows-min grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-6">
              {can(role, "folder.create") && <CreateFolderCard parentId={folder.id} label="Nova subpasta" />}
              {folders.map((f) => (
                <FolderCard key={f.id} folder={f} moveTargets={moveTargets} />
              ))}
              {documents.map((d) => (
                <DocumentCard key={d.id} doc={d} moveTargets={moveTargets} />
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}


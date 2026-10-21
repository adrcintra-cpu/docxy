import type { Metadata } from "next";
import { getCtx } from "@/lib/access";
import { can } from "@/lib/auth/permissions";
import { getCreatableWorkspaces, getLibrary, getMoveTargets } from "@/lib/queries/library";
import { getSidebarItems } from "@/lib/queries/sidebar";
import { readLibraryParams, type SearchParams } from "@/lib/queries/params";
import { Sidebar } from "@/components/layout/sidebar";
import { UnavailableState } from "@/components/ui/card";
import { LibraryFiltersBar, LibraryToolbar } from "@/components/documents/library-toolbar";
import { DocumentCard, DocumentTable, FolderCard } from "@/components/documents/library-views";
import { CreateFolderCard } from "@/components/documents/create-folder";

export const metadata: Metadata = { title: "Documentos" };

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getCtx();
  const { view, filters } = await readLibraryParams(searchParams);
  const senha = (await searchParams).senha;

  const [sidebar, library, moveTargets, workspaces] = await Promise.all([
    getSidebarItems(ctx.userId, ctx.orgId),
    getLibrary(ctx, filters),
    getMoveTargets(ctx),
    getCreatableWorkspaces(ctx),
  ]);

  const canCreateRoot = can(ctx.orgRole, "folder.create") || workspaces.length > 0;
  const canUploadRoot = can(ctx.orgRole, "document.upload");
  const total = library.folders.length + library.documents.length;
  const filtering = Boolean(filters.q || filters.type || filters.pinned);

  return (
    <>
      {senha === "atualizada" && (
        <p role="status" className="-my-3 rounded-md bg-inserted/15 px-3 py-1.5 text-label text-[#dbe58a]">
          Senha atualizada com sucesso.
        </p>
      )}

      <LibraryToolbar
        base="/"
        view={view}
        filters={filters}
        uploadDisabledReason={canUploadRoot ? undefined : "Seu perfil não permite enviar arquivos aqui. Envie dentro de uma pasta de um workspace."}
      />

      <div className="grid flex-1 gap-6 lg:grid-cols-[320px_1fr]">
        <Sidebar pinned={sidebar.pinned} recent={sidebar.recent} />

        <section aria-label="Pastas e documentos" className="flex min-w-0 flex-col gap-5">
          <LibraryFiltersBar base="/" view={view} filters={filters} total={total} />

          {view === "lista" ? (
            total > 0 ? (
              <div className="rounded-lg bg-surface px-6 py-2">
                <DocumentTable folders={library.folders} documents={library.documents} moveTargets={moveTargets} showFolder={Boolean(filters.q)} />
              </div>
            ) : (
              <Empty filtering={filtering} />
            )
          ) : (
            <div className="grid auto-rows-min grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-6">
              {!filtering && (
                <CreateFolderCard
                  workspaces={workspaces}
                  disabledReason={canCreateRoot ? undefined : "Seu perfil não permite criar pastas. Peça acesso a um workspace."}
                />
              )}
              {library.folders.map((f) => (
                <FolderCard key={f.id} folder={f} moveTargets={moveTargets} />
              ))}
              {library.documents.map((d) => (
                <DocumentCard key={d.id} doc={d} moveTargets={moveTargets} />
              ))}
              {total === 0 && (
                <div className="col-span-full">
                  <Empty filtering={filtering} />
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function Empty({ filtering }: { filtering: boolean }) {
  return filtering ? (
    <UnavailableState className="min-h-64" title="Nada encontrado" description="Tente outro termo ou limpe os filtros." />
  ) : (
    <UnavailableState
      className="min-h-64"
      title="Nenhum documento ainda"
      description="Crie uma pasta de trabalho ou envie arquivos PDF e DOCX. Você controla quem acessa cada pasta."
    />
  );
}

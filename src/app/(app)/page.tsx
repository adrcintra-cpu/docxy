import type { Metadata } from "next";
import { FileText, Folder, LayoutGrid, List, Pin, Plus, Upload } from "lucide-react";
import { requireUser, getActiveMembership } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import { getSidebarItems } from "@/lib/queries/sidebar";
import { Sidebar } from "@/components/layout/sidebar";
import { SearchField } from "@/components/ui/search-field";
import { IconButton } from "@/components/ui/icon-button";
import { Button } from "@/components/ui/button";
import { Card, UnavailableState } from "@/components/ui/card";
import { formatBytes } from "@/lib/utils";

export const metadata: Metadata = { title: "Documentos" };

const PHASE_2 = "Disponível na Fase 2 — gestão de documentos";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ senha?: string }> }) {
  const user = await requireUser();
  const membership = (await getActiveMembership(user.id))!;
  const { senha } = await searchParams;
  const orgId = membership.organizationId;

  const [sidebar, folders, documents] = await Promise.all([
    getSidebarItems(user.id, orgId),
    db.folder.findMany({
      where: { organizationId: orgId, parentId: null, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 24,
      select: { id: true, name: true, _count: { select: { documents: { where: { deletedAt: null } } } } },
    }),
    db.document.findMany({
      where: { organizationId: orgId, folderId: null, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 24,
      select: { id: true, title: true, currentVersion: { select: { sizeBytes: true, versionNumber: true } } },
    }),
  ]);

  const canUpload = can(membership.role, "document.upload");
  const isEmpty = folders.length === 0 && documents.length === 0;

  return (
    <>
      {senha === "atualizada" && (
        <p role="status" className="rounded-md bg-inserted/15 px-4 py-3 text-body-sm text-[#dbe58a]">
          Senha atualizada com sucesso.
        </p>
      )}

      {/* Barra de ferramentas (referência 02) */}
      <section className="grid items-center gap-4 rounded-lg bg-surface p-4 shadow-panel sm:p-6 lg:grid-cols-[auto_1fr_auto_auto] lg:gap-8 lg:px-12">
        <div className="flex items-center gap-8" role="tablist" aria-label="Modo de visualização">
          <span role="tab" aria-selected className="flex items-center gap-2 text-body font-medium text-brand">
            <LayoutGrid className="size-5" /> Em ícone
          </span>
          <span role="tab" aria-selected={false} aria-disabled title={PHASE_2} className="flex items-center gap-2 text-body text-ink-subtle">
            <List className="size-5" /> Em lista
          </span>
        </div>
        <SearchField className="min-w-0" disabledReason="Pesquisa global — disponível na Fase 2" />
        <IconButton label={`Itens fixados — ${PHASE_2}`} tone="filled" disabled>
          <Pin className="size-5" />
        </IconButton>
        <Button variant="primary" disabled title={canUpload ? PHASE_2 : "Seu perfil não permite enviar arquivos"}>
          <Upload className="size-4" /> Upload arquivo
        </Button>
      </section>

      <div className="grid flex-1 gap-6 lg:grid-cols-[320px_1fr]">
        <Sidebar pinned={sidebar.pinned} recent={sidebar.recent} />

        <section aria-label="Pastas e documentos" className="grid auto-rows-min grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-6">
          <Card className="flex min-h-64 flex-col items-center justify-center gap-4 text-center text-ink-subtle" aria-disabled title={PHASE_2}>
            <span className="flex size-24 items-center justify-center rounded-full border-2 border-line">
              <Plus className="size-10" strokeWidth={1.25} />
            </span>
            <span className="text-body">Criar Pasta de Trabalho</span>
            <span className="rounded-full bg-sunken px-3 py-1 text-label text-ink-muted">Fase 2</span>
          </Card>

          {folders.map((f) => (
            <Card key={f.id} className="flex min-h-64 flex-col gap-3">
              <div className="flex items-center gap-3">
                <Folder className="size-6 text-brand" strokeWidth={1.5} />
                <span className="truncate text-body font-medium">{f.name}</span>
              </div>
              <div className="flex flex-1 items-center justify-center rounded-sm bg-sunken text-body-sm text-ink-muted">
                {f._count.documents} {f._count.documents === 1 ? "arquivo" : "arquivos"}
              </div>
            </Card>
          ))}

          {documents.map((d) => (
            <Card key={d.id} className="flex min-h-64 flex-col gap-3">
              <div className="flex items-center gap-3">
                <FileText className="size-6 text-removed" strokeWidth={1.5} />
                <span className="truncate text-body font-medium">{d.title}</span>
              </div>
              <div className="flex flex-1 items-center justify-center rounded-sm bg-sunken text-body-sm text-ink-muted">
                {d.currentVersion
                  ? `vs${String(d.currentVersion.versionNumber).padStart(2, "0")} · ${formatBytes(d.currentVersion.sizeBytes)}`
                  : "Processando"}
              </div>
            </Card>
          ))}

          {isEmpty && (
            <UnavailableState
              className="col-span-full min-h-64"
              phase="Fase 2"
              title="Nenhum documento ainda"
              description="O envio de arquivos, a criação de pastas e o versionamento chegam na próxima fase. Sua conta, organização e permissões já estão ativas."
            />
          )}
        </section>
      </div>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Download, Eye, FileSearch, Undo2 } from "lucide-react";
import { getCtx, requireDocument } from "@/lib/access";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { updateDocumentDescription } from "@/app/actions/library";
import { documentPerms, getBreadcrumb, getMoveTargets, getShareInfo, touchRecent } from "@/lib/queries/library";
import { formatBytes, formatDate } from "@/lib/utils";
import { DescriptionEditor } from "@/components/documents/description-editor";
import { SharePanel } from "@/components/documents/share-panel";
import { ItemActions } from "@/components/documents/item-actions";
import { FileIcon } from "@/components/documents/library-views";
import { UploadButton } from "@/components/documents/upload-dialog";
import { StatusChip } from "@/components/ui/status-chip";
import { CompareButton } from "@/components/compare/compare-dialog";
import { RetryProcessingButton } from "@/components/documents/retry-button";
import { getVersionOptions } from "@/lib/queries/compare";

export const metadata: Metadata = { title: "Documento" };

const STAGE: Record<string, { label: string; tone: "neutral" | "changed" | "removed" | "info" }> = {
  QUEUED: { label: "Na fila de leitura", tone: "neutral" },
  EXTRACTING_TEXT: { label: "Lendo texto", tone: "info" },
  OCR: { label: "OCR", tone: "info" },
  INDEXING: { label: "Indexando", tone: "info" },
  DONE: { label: "Pronto", tone: "changed" },
  FAILED: { label: "Falhou", tone: "removed" },
};

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getCtx();
  let access;
  try {
    access = await requireDocument(ctx, id, "document.read");
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  const { document, role } = access;

  const [versions, share, moveTargets, trail, owner, pin, compareOptions] = await Promise.all([
    db.documentVersion.findMany({
      where: { documentId: document.id, stage: { not: "UPLOADING" } },
      orderBy: { versionNumber: "desc" },
      include: { uploadedBy: { select: { name: true, email: true } } },
    }),
    getShareInfo(ctx, { documentId: document.id }),
    getMoveTargets(ctx),
    getBreadcrumb(ctx.orgId, document.folderId),
    db.user.findUnique({ where: { id: document.createdById }, select: { id: true, name: true, email: true } }),
    db.pin.findFirst({ where: { userId: ctx.userId, documentId: document.id }, select: { id: true } }),
    getVersionOptions(ctx, document.id),
    touchRecent(ctx.userId, { documentId: document.id }),
  ]);
  const workspace = document.workspaceId ? await db.workspace.findUnique({ where: { id: document.workspaceId }, select: { name: true } }) : null;
  const current = versions.find((v) => v.id === document.currentVersionId) ?? versions[0];
  const ext = current?.fileName.toLowerCase().endsWith(".docx") ? "docx" : "pdf";
  const canDownload = can(role, "document.download");
  const readyVersions = versions.filter((v) => v.stage !== "FAILED");

  return (
    <>
      <section className="flex flex-wrap items-center gap-4 rounded-lg bg-surface p-4 shadow-panel sm:p-6 lg:px-12">
        <FileIcon ext={current ? ext : null} className="[&_svg]:size-8" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-title font-semibold">{document.title}</h1>
          <p className="text-body-sm text-ink-muted tabular-nums">
            {current ? `vs${String(current.versionNumber).padStart(2, "0")} · ${formatBytes(current.sizeBytes)}${current.pageCount ? ` · ${current.pageCount} pág.` : ""}` : "Sem versão publicada"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/documentos/${document.id}/ver`} className="inline-flex h-11 items-center gap-2 rounded-full bg-brand px-5 text-label font-semibold uppercase tracking-caps text-on-light hover:brightness-95">
            <Eye className="size-4" /> Abrir
          </Link>
          <CompareButton options={compareOptions} disabledReason={compareOptions.filter((o) => !o.notReady).length < 2 ? "É preciso ter duas versões já lidas para comparar." : undefined} />
          <UploadButton
            documentId={document.id}
            label="Nova versão"
            disabledReason={can(role, "document.upload") ? undefined : "Seu perfil não permite enviar versões."}
          />
          <ItemActions
            kind="document"
            id={document.id}
            name={document.title}
            pinned={Boolean(pin)}
            permissions={documentPerms(role)}
            moveTargets={moveTargets}
            currentParentId={document.folderId}
            downloadVersionId={canDownload ? current?.id : null}
          />
          <Link href={document.folderId ? `/pastas/${document.folderId}` : "/"} className="flex items-center gap-2 text-body text-ink-muted hover:text-ink">
            <Undo2 className="size-5" strokeWidth={1.5} /> Voltar
          </Link>
        </div>
      </section>

      <div className="grid flex-1 gap-6 lg:grid-cols-[320px_1fr]">
        <aside className="flex flex-col gap-6 self-start rounded-lg bg-surface p-6">
          <section className="flex flex-col gap-2 text-body-sm">
            <h2 className="flex items-center gap-2 text-ink-muted">
              <FileSearch className="size-4" /> Preview
            </h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
              <dt className="text-ink-muted">Arquivo</dt>
              <dd className="truncate">{current?.fileName ?? "—"}</dd>
              <dt className="text-ink-muted">Versões</dt>
              <dd className="tabular-nums">{readyVersions.length}</dd>
              <dt className="text-ink-muted">Inserido em</dt>
              <dd className="tabular-nums">{formatDate(document.createdAt)}</dd>
              <dt className="text-ink-muted">Pasta</dt>
              <dd className="truncate">{trail.at(-1)?.name ?? "Início"}</dd>
              {current && (
                <>
                  <dt className="text-ink-muted">SHA-256</dt>
                  <dd className="truncate font-mono text-label text-ink-muted" title={current.sha256}>
                    {current.sha256.slice(0, 16)}…
                  </dd>
                </>
              )}
            </dl>
          </section>
          <div className="h-px bg-line/60" />
          <DescriptionEditor
            value={document.description}
            canEdit={can(role, "document.edit")}
            onSave={updateDocumentDescription.bind(null, document.id)}
          />
          <div className="h-px bg-line/60" />
          <SharePanel
            kind="document"
            id={document.id}
            owner={{ id: owner?.id ?? document.createdById, name: owner?.name ?? owner?.email ?? "—" }}
            workspaceName={workspace?.name ?? null}
            people={share.people}
            workspaceShares={share.workspaceShares}
            workspaces={share.workspaces}
            canShare={can(role, "document.share")}
          />
        </aside>

        <section className="flex min-w-0 flex-col gap-5" aria-label="Versões">
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
            <span className="text-ink">{document.title}</span>
          </nav>

          <div className="overflow-x-auto px-2 lg:px-6">
            <table className="w-full min-w-[860px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line/70 text-body-sm text-ink-muted">
                  <th className="py-3 pr-4 font-normal">Versão</th>
                  <th className="px-4 py-3 font-normal">Arquivo</th>
                  <th className="px-4 py-3 text-center font-normal">Tamanho</th>
                  <th className="px-4 py-3 font-normal">Enviado por</th>
                  <th className="px-4 py-3 text-center font-normal">Data inserção</th>
                  <th className="px-4 py-3 text-center font-normal">Última abertura</th>
                  <th className="px-4 py-3 text-center font-normal">Status</th>
                  <th className="py-3 pl-4 text-center font-normal">Ação</th>
                </tr>
              </thead>
              <tbody className="text-body tabular-nums">
                {versions.map((v) => {
                  const stage = STAGE[v.stage] ?? STAGE.QUEUED!;
                  const isCurrent = v.id === document.currentVersionId;
                  const usable = v.stage !== "FAILED";
                  return (
                    <tr key={v.id} className="border-b border-line/50">
                      <td className="py-5 pr-4 font-medium">
                        vs{String(v.versionNumber).padStart(2, "0")}
                        {isCurrent && <span className="ml-2 rounded-full bg-brand px-2 py-0.5 text-label font-semibold text-on-light">Atual</span>}
                      </td>
                      <td className="max-w-64 truncate px-4" title={v.fileName}>
                        {v.fileName}
                        {v.comment && <span className="block truncate text-label text-ink-muted">{v.comment}</span>}
                      </td>
                      <td className="px-4 text-center">{formatBytes(v.sizeBytes)}</td>
                      <td className="truncate px-4 text-body-sm">{v.uploadedBy.name ?? v.uploadedBy.email}</td>
                      <td className="px-4 text-center">{formatDate(v.createdAt)}</td>
                      <td className="px-4 text-center">{formatDate(v.lastViewedAt)}</td>
                      <td className="px-4 text-center">
                        <span title={v.processingError ?? undefined} className="inline-flex flex-col items-center gap-1">
                          <StatusChip tone={v.stage === "DONE" && !v.hasText ? "removed" : stage.tone}>{v.stage === "DONE" && !v.hasText ? "Sem texto" : stage.label}</StatusChip>
                          {v.stage === "FAILED" && can(role, "document.upload") && <RetryProcessingButton versionId={v.id} />}
                        </span>
                      </td>
                      <td className="pl-4">
                        {usable && (
                          <div className="flex justify-center gap-1">
                            <Link
                              href={`/documentos/${document.id}/ver?v=${v.id}`}
                              aria-label={`Abrir vs${String(v.versionNumber).padStart(2, "0")} no visualizador`}
                              title="Abrir no visualizador"
                              className="flex size-8 items-center justify-center rounded-full text-ink-muted hover:bg-sunken hover:text-ink"
                            >
                              <Eye className="size-4" />
                            </Link>
                            {canDownload && (
                              <a
                                href={`/api/versions/${v.id}?download=1`}
                                aria-label={`Baixar vs${String(v.versionNumber).padStart(2, "0")}`}
                                title="Baixar"
                                className="flex size-8 items-center justify-center rounded-full text-ink-muted hover:bg-sunken hover:text-ink"
                              >
                                <Download className="size-4" />
                              </a>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}

import Link from "next/link";
import { FileText, Folder, Pin } from "lucide-react";
import { AvatarStack } from "@/components/ui/avatar";
import { StatusChip } from "@/components/ui/status-chip";
import { cn, formatBytes, formatDate } from "@/lib/utils";
import type { DocumentItem, FolderItem } from "@/lib/queries/library";
import { ItemActions, type FolderOption } from "./item-actions";

const vs = (n: number | null) => (n ? `vs${String(n).padStart(2, "0")}` : "—");

/** Ícone de pasta de trabalho Docxy (referência 03): documento amarelo com o símbolo. */
export function WorkFolderIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 80" className={cn("h-20 w-16", className)} aria-hidden>
      <path d="M8 0h36l20 20v52a8 8 0 0 1-8 8H8a8 8 0 0 1-8-8V8a8 8 0 0 1 8-8z" fill="var(--color-brand)" />
      <path d="M44 0v14a6 6 0 0 0 6 6h14z" fill="#e8dc4a" />
      <g fill="none" stroke="var(--color-on-light)" strokeWidth="3.2" strokeLinejoin="round">
        <rect x="14" y="34" width="22" height="16" rx="2" />
        <rect x="24" y="42" width="24" height="16" rx="2" />
      </g>
    </svg>
  );
}

export function FileIcon({ ext, className }: { ext: "pdf" | "docx" | null; className?: string }) {
  return (
    <span className={cn("relative inline-flex shrink-0", className)} aria-label={ext?.toUpperCase() ?? "Arquivo"}>
      <FileText className={cn("size-6", ext === "docx" ? "text-accent-strong" : "text-removed")} strokeWidth={1.5} />
    </span>
  );
}

function statusChip(d: DocumentItem) {
  if (d.status === "FAILED") return <StatusChip tone="removed">Falhou</StatusChip>;
  if (d.versionCount > 1) return <StatusChip tone="changed">Alterado</StatusChip>;
  if (d.lastViewedAt) return <StatusChip tone="neutral">Visualizado</StatusChip>;
  return <StatusChip tone="neutral">Novo</StatusChip>;
}

// ─── Grade (Em ícone) ───────────────────────────────────────────────────

export function FolderCard({ folder, moveTargets }: { folder: FolderItem; moveTargets: FolderOption[] }) {
  const actions = (
    <ItemActions kind="folder" id={folder.id} name={folder.name} pinned={folder.pinned} permissions={folder.permissions} moveTargets={moveTargets} currentParentId={folder.parentId} />
  );

  if (folder.isWorkFolder) {
    return (
      <article className="relative flex min-h-64 flex-col rounded-md bg-surface p-5 transition-colors hover:bg-[#30374a]">
        <div className="flex items-start justify-between">
          <Pin className={cn("size-5", folder.pinned ? "fill-brand text-brand" : "text-ink-subtle")} strokeWidth={1.5} aria-label={folder.pinned ? "Fixada" : undefined} />
          <div className="relative z-10">{actions}</div>
        </div>
        <Link href={`/pastas/${folder.id}`} className="flex flex-1 flex-col items-center gap-4 py-3 text-center after:absolute after:inset-0 after:content-['']">
          <WorkFolderIcon className="h-[72px] w-[58px]" />
          <span className="line-clamp-2 max-w-48 text-body font-medium">{folder.name}</span>
        </Link>
        <div className="relative flex items-end justify-between gap-3 border-t border-line/60 pt-4">
          <div>
            <p className="text-label text-ink-muted">Tamanho</p>
            <p className="text-body-sm font-medium tabular-nums">
              {folder.docCount} {folder.docCount === 1 ? "fonte" : "fontes"} | {formatBytes(folder.totalBytes)}
            </p>
          </div>
          <AvatarStack people={folder.people} size={36} />
        </div>
      </article>
    );
  }

  return (
    <article className="relative flex min-h-64 flex-col gap-3 rounded-md bg-surface p-3">
      <div className="flex items-center gap-3 px-1">
        <Folder className="size-6 shrink-0 text-brand" strokeWidth={1.5} />
        <Link href={`/pastas/${folder.id}`} className="min-w-0 flex-1 truncate text-body font-medium hover:underline">
          {folder.name}
        </Link>
        {actions}
      </div>
      <ul className="flex flex-1 flex-col gap-1 rounded-sm bg-sunken p-2">
        {folder.preview.length === 0 && <li className="m-auto text-label text-ink-subtle">Pasta vazia</li>}
        {folder.preview.map((d) => (
          <li key={d.id}>
            <Link href={`/documentos/${d.id}`} className="flex items-center gap-2 rounded-sm px-1 py-1.5 text-body-sm text-ink-muted hover:bg-surface hover:text-ink">
              <FileText className="size-5 shrink-0 text-removed/80" strokeWidth={1.5} />
              <span className="truncate">{d.title}</span>
            </Link>
          </li>
        ))}
      </ul>
      {folder.docCount > folder.preview.length && <p className="px-1 text-label text-ink-muted">+ {folder.docCount - folder.preview.length} documentos</p>}
    </article>
  );
}

export function DocumentCard({ doc, moveTargets }: { doc: DocumentItem; moveTargets: FolderOption[] }) {
  return (
    <article className="relative flex min-h-64 flex-col gap-3 rounded-md bg-surface p-3">
      <div className="flex items-center gap-3 px-1">
        <FileIcon ext={doc.ext} />
        <Link href={`/documentos/${doc.id}`} className="min-w-0 flex-1 truncate text-body font-medium hover:underline">
          {doc.title}
        </Link>
        <ItemActions kind="document" id={doc.id} name={doc.title} pinned={doc.pinned} permissions={doc.permissions} moveTargets={moveTargets} currentParentId={doc.folderId} downloadVersionId={doc.versionId} />
      </div>
      {/* Miniatura da primeira página chega com o visualizador (Fase 3). */}
      <Link href={`/documentos/${doc.id}`} className="flex flex-1 flex-col justify-between rounded-sm bg-paper p-4 text-on-light">
        <div className="flex flex-col gap-1.5" aria-hidden>
          {[92, 78, 85, 64, 88, 70].map((w, i) => (
            <span key={i} className="h-1.5 rounded-full bg-on-light/15" style={{ width: `${w}%` }} />
          ))}
        </div>
        <div className="flex items-center justify-between text-label font-medium text-on-light/70">
          <span>{doc.ext?.toUpperCase() ?? "—"}</span>
          <span className="tabular-nums">
            {vs(doc.versionNumber)} · {formatBytes(doc.sizeBytes)}
          </span>
        </div>
      </Link>
    </article>
  );
}

// ─── Lista (Em lista) — tabela da referência 04 ────────────────────────

export function DocumentTable({
  folders = [],
  documents,
  moveTargets,
  showFolder,
}: {
  folders?: FolderItem[];
  documents: DocumentItem[];
  moveTargets: FolderOption[];
  showFolder?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] border-collapse text-left">
        <thead>
          <tr className="border-b border-line/70 text-body-sm text-ink-muted">
            <th className="py-3 pr-4 font-normal">Arquivo</th>
            <th className="px-4 py-3 text-center font-normal">Versões</th>
            <th className="px-4 py-3 text-center font-normal">Tamanho</th>
            <th className="px-4 py-3 text-center font-normal">Data inserção</th>
            <th className="px-4 py-3 text-center font-normal">Última abertura</th>
            <th className="px-4 py-3 text-center font-normal">Status</th>
            <th className="py-3 pl-4 text-center font-normal">Ação</th>
          </tr>
        </thead>
        <tbody className="text-body tabular-nums">
          {folders.map((f) => (
            <tr key={f.id} className="border-b border-line/50">
              <td className="py-5 pr-4">
                <Link href={`/pastas/${f.id}`} className="flex items-center gap-3 hover:underline">
                  <Folder className="size-6 shrink-0 text-brand" strokeWidth={1.5} />
                  <span className="truncate">{f.name}</span>
                </Link>
              </td>
              <td className="px-4 text-center text-ink-muted">—</td>
              <td className="px-4 text-center">{formatBytes(f.totalBytes)}</td>
              <td className="px-4 text-center text-ink-muted">—</td>
              <td className="px-4 text-center text-ink-muted">—</td>
              <td className="px-4 text-center">
                <StatusChip tone="neutral">{f.docCount} {f.docCount === 1 ? "arquivo" : "arquivos"}</StatusChip>
              </td>
              <td className="pl-4">
                <div className="flex justify-center">
                  <ItemActions kind="folder" id={f.id} name={f.name} pinned={f.pinned} permissions={f.permissions} moveTargets={moveTargets} currentParentId={f.parentId} />
                </div>
              </td>
            </tr>
          ))}
          {documents.map((d) => (
            <tr key={d.id} className="border-b border-line/50">
              <td className="py-5 pr-4">
                <Link href={`/documentos/${d.id}`} className="flex items-center gap-3 hover:underline">
                  <FileIcon ext={d.ext} />
                  <span className="min-w-0">
                    <span className="block truncate">{d.fileName ?? d.title}</span>
                    {showFolder && d.folderName && <span className="block truncate text-label text-ink-muted">{d.folderName}</span>}
                  </span>
                </Link>
              </td>
              <td className="px-4 text-center">{vs(d.versionNumber)}</td>
              <td className="px-4 text-center">{formatBytes(d.sizeBytes)}</td>
              <td className="px-4 text-center">{formatDate(d.createdAt)}</td>
              <td className="px-4 text-center">{formatDate(d.lastViewedAt)}</td>
              <td className="px-4 text-center">{statusChip(d)}</td>
              <td className="pl-4">
                <div className="flex justify-center">
                  <ItemActions kind="document" id={d.id} name={d.title} pinned={d.pinned} permissions={d.permissions} moveTargets={moveTargets} currentParentId={d.folderId} downloadVersionId={d.versionId} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

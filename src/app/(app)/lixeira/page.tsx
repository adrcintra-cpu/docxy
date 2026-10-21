import type { Metadata } from "next";
import { FileText, Folder } from "lucide-react";
import { getCtx } from "@/lib/access";
import { getTrash } from "@/lib/queries/library";
import { ItemActions } from "@/components/documents/item-actions";
import { UnavailableState } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Lixeira" };

const restoreOnly = { manage: false, remove: true, share: false };

export default async function TrashPage() {
  const ctx = await getCtx();
  const trash = await getTrash(ctx);
  const rows = [
    ...trash.folders.map((f) => ({ kind: "folder" as const, id: f.id, name: f.name, where: null as string | null, deletedAt: f.deletedAt })),
    ...trash.documents.map((d) => ({ kind: "document" as const, id: d.id, name: d.title, where: d.folderName, deletedAt: d.deletedAt })),
  ].sort((a, b) => b.deletedAt.getTime() - a.deletedAt.getTime());

  return (
    <section className="flex flex-1 flex-col gap-6 rounded-lg bg-surface p-6 lg:px-12">
      <div>
        <h1 className="text-title font-semibold">Lixeira</h1>
        <p className="mt-1 max-w-2xl text-body-sm text-ink-muted">
          Itens excluídos ficam aqui e podem ser restaurados. Versões e históricos são preservados; nada é apagado de forma definitiva por esta tela.
        </p>
      </div>
      {rows.length === 0 ? (
        <UnavailableState className="min-h-64" title="A lixeira está vazia" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b border-line/70 text-body-sm text-ink-muted">
                <th className="py-3 pr-4 font-normal">Item</th>
                <th className="px-4 py-3 font-normal">Estava em</th>
                <th className="px-4 py-3 text-center font-normal">Excluído em</th>
                <th className="py-3 pl-4 text-right font-normal">Ação</th>
              </tr>
            </thead>
            <tbody className="text-body tabular-nums">
              {rows.map((r) => (
                <tr key={`${r.kind}-${r.id}`} className="border-b border-line/50">
                  <td className="py-4 pr-4">
                    <span className="flex items-center gap-3">
                      {r.kind === "folder" ? <Folder className="size-5 text-brand" strokeWidth={1.5} /> : <FileText className="size-5 text-removed" strokeWidth={1.5} />}
                      {r.name}
                    </span>
                  </td>
                  <td className="px-4 text-body-sm text-ink-muted">{r.where ?? (r.kind === "folder" ? "—" : "Início")}</td>
                  <td className="px-4 text-center">{formatDate(r.deletedAt)}</td>
                  <td className="pl-4">
                    <div className="flex justify-end">
                      <ItemActions kind={r.kind} id={r.id} name={r.name} permissions={restoreOnly} trashed />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

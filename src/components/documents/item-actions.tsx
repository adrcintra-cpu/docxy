"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, FolderInput, Pencil, Pin, PinOff, Share2, Trash2, Undo2 } from "lucide-react";
import {
  moveDocument,
  moveFolder,
  renameDocument,
  renameFolder,
  restoreDocument,
  restoreFolder,
  togglePin,
  trashDocument,
  trashFolder,
} from "@/app/actions/library";
import type { ActionResult } from "@/lib/errors";
import { ItemMenu, type MenuItem } from "@/components/ui/menu";
import { Dialog, FormError } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

export interface FolderOption {
  id: string;
  label: string;
}

export interface ItemPermissions {
  manage: boolean; // renomear, mover
  remove: boolean; // lixeira
  share: boolean;
}

/** Executa uma action, mostra o aviso e atualiza a tela. */
export function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  /** `onError` mostra o erro no próprio formulário (sem aviso e sem fechar). */
  const run = (fn: () => Promise<ActionResult<unknown>>, after?: () => void, onError?: (msg: string) => void) =>
    start(async () => {
      const res = await fn();
      if (res.ok) {
        if (res.message) toast(res.message);
        after?.();
        router.refresh();
      } else if (onError) onError(res.error);
      else toast(res.error, "error");
    });
  return { run, pending };
}

/** Menu ⋮ de pasta ou documento, com os diálogos de renomear e mover. */
export function ItemActions({
  kind,
  id,
  name,
  pinned,
  permissions,
  moveTargets,
  currentParentId,
  downloadVersionId,
  trashed,
}: {
  kind: "folder" | "document";
  id: string;
  name: string;
  pinned?: boolean;
  permissions: ItemPermissions;
  moveTargets?: FolderOption[];
  currentParentId?: string | null;
  downloadVersionId?: string | null;
  trashed?: boolean;
}) {
  const router = useRouter();
  const { run, pending } = useRun();
  const [dialog, setDialog] = useState<"rename" | "move" | null>(null);

  if (trashed) {
    if (!permissions.remove) return null;
    return (
      <Button size="sm" variant="primary" loading={pending} onClick={() => run(() => (kind === "folder" ? restoreFolder(id) : restoreDocument(id)))}>
        <Undo2 className="size-4" /> Restaurar
      </Button>
    );
  }

  const items: MenuItem[] = [
    ...(kind === "document" && downloadVersionId
      ? [{ label: "Baixar", icon: Download, onSelect: () => (window.location.href = `/api/versions/${downloadVersionId}?download=1`) }]
      : []),
    { label: pinned ? "Desafixar" : "Fixar", icon: pinned ? PinOff : Pin, onSelect: () => run(() => togglePin(kind, id)) },
    ...(permissions.manage
      ? [
          { label: "Renomear", icon: Pencil, onSelect: () => setDialog("rename") },
          { label: "Mover", icon: FolderInput, onSelect: () => setDialog("move") },
        ]
      : []),
    ...(permissions.share
      ? [{ label: "Compartilhar", icon: Share2, onSelect: () => router.push(kind === "folder" ? `/pastas/${id}#compartilhado` : `/documentos/${id}#compartilhado`) }]
      : []),
    ...(permissions.remove
      ? [
          {
            label: "Enviar para a lixeira",
            icon: Trash2,
            danger: true,
            onSelect: () => run(() => (kind === "folder" ? trashFolder(id) : trashDocument(id))),
          },
        ]
      : []),
  ];

  return (
    <>
      <ItemMenu items={items} label={`Ações de ${name}`} />
      {dialog === "rename" && (
        <RenameDialog
          initial={name}
          title={kind === "folder" ? "Renomear pasta" : "Renomear documento"}
          onClose={() => setDialog(null)}
          onSubmit={(value) => (kind === "folder" ? renameFolder(id, value) : renameDocument(id, value))}
        />
      )}
      {dialog === "move" && (
        <MoveDialog
          kind={kind}
          id={id}
          options={(moveTargets ?? []).filter((o) => o.id !== id)}
          currentParentId={currentParentId ?? null}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}

export function RenameDialog({
  initial,
  title,
  onClose,
  onSubmit,
}: {
  initial: string;
  title: string;
  onClose: () => void;
  onSubmit: (value: string) => Promise<ActionResult<unknown>>;
}) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string>();
  const { run, pending } = useRun();
  return (
    <Dialog open onClose={onClose} title={title}>
      <form
        className="flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          setError(undefined);
          run(() => onSubmit(value), onClose, setError);
        }}
      >
        <Input label="Nome" value={value} onChange={(e) => setValue(e.target.value)} autoFocus maxLength={120} />
        <FormError message={error} />
        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="brand" loading={pending}>
            Salvar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function MoveDialog({
  kind,
  id,
  options,
  currentParentId,
  onClose,
}: {
  kind: "folder" | "document";
  id: string;
  options: FolderOption[];
  currentParentId: string | null;
  onClose: () => void;
}) {
  const [target, setTarget] = useState(currentParentId ?? "");
  const [error, setError] = useState<string>();
  const { run, pending } = useRun();
  return (
    <Dialog open onClose={onClose} title={kind === "folder" ? "Mover pasta" : "Mover documento"}>
      <form
        className="flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          const dest = target || null;
          run(() => (kind === "folder" ? moveFolder(id, dest) : moveDocument(id, dest)), onClose, setError);
        }}
      >
        <Select label="Destino" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">Início (sem pasta)</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </Select>
        <FormError message={error} />
        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="brand" loading={pending} disabled={(target || null) === currentParentId}>
            Mover
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

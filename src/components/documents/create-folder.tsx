"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { createFolder } from "@/app/actions/library";
import { Dialog, FormError } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useRun, type FolderOption } from "./item-actions";

/** Card "Criar Pasta de Trabalho" (referências 02–03) com o diálogo de criação. */
export function CreateFolderCard({
  parentId,
  workspaces,
  disabledReason,
  className,
  label = "Criar Pasta de Trabalho",
}: {
  parentId?: string;
  /** Workspaces onde a pessoa pode criar pastas (só na raiz; subpastas herdam). */
  workspaces?: FolderOption[];
  disabledReason?: string;
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        disabled={Boolean(disabledReason)}
        title={disabledReason}
        onClick={() => setOpen(true)}
        className={cn(
          "group flex min-h-64 flex-col items-center justify-center gap-4 rounded-md bg-surface p-4 text-center transition-colors hover:bg-[#30374a] disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
      >
        <span className="flex size-24 items-center justify-center rounded-full border-2 border-line text-ink-muted transition-colors group-hover:border-brand group-hover:text-brand">
          <Plus className="size-10" strokeWidth={1.25} />
        </span>
        <span className="max-w-40 text-body">{label}</span>
      </button>
      {open && <CreateFolderDialog parentId={parentId} workspaces={workspaces} onClose={() => setOpen(false)} />}
    </>
  );
}

function CreateFolderDialog({ parentId, workspaces, onClose }: { parentId?: string; workspaces?: FolderOption[]; onClose: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [error, setError] = useState<string>();
  const { run, pending } = useRun();

  return (
    <Dialog open onClose={onClose} title={parentId ? "Nova subpasta" : "Nova pasta de trabalho"}>
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          setError(undefined);
          run(() => createFolder({ name, description, parentId, workspaceId: workspaceId || null }), onClose, setError);
        }}
      >
        <Input label="Nome" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Contratos de resseguro 2026" autoFocus maxLength={120} required />
        {!parentId && workspaces && (
          <Select label="Quem acessa" value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)}>
            <option value="">Só eu (e quem eu compartilhar)</option>
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                Workspace: {w.label}
              </option>
            ))}
          </Select>
        )}
        <div className="flex flex-col gap-2">
          <label htmlFor="folder-description" className="text-label text-ink-muted">
            Descrição (opcional)
          </label>
          <textarea
            id="folder-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={2000}
            className="w-full rounded-sm border border-line bg-sunken px-3 py-2 text-body text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none"
          />
        </div>
        <FormError message={error} />
        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="brand" loading={pending} disabled={!name.trim()}>
            Criar pasta
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

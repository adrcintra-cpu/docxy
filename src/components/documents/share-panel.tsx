"use client";

import { useState } from "react";
import type { Role } from "@prisma/client";
import { Award, CirclePlus, Users, X } from "lucide-react";
import { removePermission, revokeShare, shareWithPerson, shareWithWorkspace, updatePermission } from "@/app/actions/sharing";
import { Avatar } from "@/components/ui/avatar";
import { Dialog, FormError } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ROLE_LABEL } from "@/lib/auth/permissions";
import { useRun, type FolderOption } from "./item-actions";

const GRANTABLE: Role[] = ["VIEWER", "WRITER", "EDITOR", "OWNER"];

export interface ShareEntry {
  permissionId: string;
  userId: string;
  name: string;
  role: Role;
}
export interface WorkspaceShareEntry {
  shareId: string;
  name: string;
  role: Role;
}

/** Bloco "Compartilhado" do painel lateral (referência 04). */
export function SharePanel({
  kind,
  id,
  owner,
  workspaceName,
  people,
  workspaceShares,
  workspaces,
  canShare,
}: {
  kind: "folder" | "document";
  id: string;
  owner: { id: string; name: string };
  /** Workspace ao qual o item pertence (todos os membros têm acesso). */
  workspaceName: string | null;
  people: ShareEntry[];
  workspaceShares: WorkspaceShareEntry[];
  workspaces: FolderOption[];
  canShare: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const { run, pending } = useRun();

  return (
    <section id="compartilhado" className="flex flex-col gap-4">
      <h2 className="flex items-center gap-2 text-body-sm text-ink-muted">
        <Users className="size-4" /> Compartilhado
      </h2>

      <ul className="flex flex-col gap-3">
        <li className="flex items-center gap-3">
          <Avatar id={owner.id} name={owner.name} size={44} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-body-sm font-medium">{owner.name}</p>
            <p className="text-label text-ink-muted">Owner</p>
          </div>
          <Award className="size-5 text-ink-muted" strokeWidth={1.5} aria-label="Criou o item" />
        </li>

        {people.map((p) => (
          <li key={p.permissionId} className="flex items-center gap-3">
            <Avatar id={p.userId} name={p.name} size={44} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-body-sm font-medium">{p.name}</p>
              {canShare ? (
                <label className="sr-only" htmlFor={`role-${p.permissionId}`}>
                  Perfil de {p.name}
                </label>
              ) : null}
              {canShare ? (
                <select
                  id={`role-${p.permissionId}`}
                  value={p.role}
                  disabled={pending}
                  onChange={(e) => run(() => updatePermission(p.permissionId, e.target.value as Role))}
                  className="-ml-1 rounded-sm bg-transparent px-1 text-label text-ink-muted hover:bg-sunken focus:outline-none"
                >
                  {GRANTABLE.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-label text-ink-muted">{ROLE_LABEL[p.role]}</p>
              )}
            </div>
            {canShare && (
              <button
                type="button"
                aria-label={`Remover acesso de ${p.name}`}
                onClick={() => run(() => removePermission(p.permissionId))}
                className="rounded-full p-1 text-ink-muted hover:text-ink"
              >
                <X className="size-4" />
              </button>
            )}
          </li>
        ))}

        {workspaceName && (
          <li className="flex items-center gap-3 text-body-sm text-ink-muted">
            <span className="flex size-11 items-center justify-center rounded-full bg-sunken">
              <Users className="size-5" strokeWidth={1.5} />
            </span>
            Membros de {workspaceName}
          </li>
        )}
        {workspaceShares.map((s) => (
          <li key={s.shareId} className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-full bg-sunken text-ink-muted">
              <Users className="size-5" strokeWidth={1.5} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-body-sm font-medium">{s.name}</p>
              <p className="text-label text-ink-muted">Workspace · {ROLE_LABEL[s.role]}</p>
            </div>
            {canShare && (
              <button type="button" aria-label={`Remover ${s.name}`} onClick={() => run(() => revokeShare(s.shareId))} className="rounded-full p-1 text-ink-muted hover:text-ink">
                <X className="size-4" />
              </button>
            )}
          </li>
        ))}
      </ul>

      {canShare && (
        <button type="button" onClick={() => setAdding(true)} className="flex items-center gap-3 self-start rounded-sm py-1 text-body text-ink hover:text-brand">
          <CirclePlus className="size-5" strokeWidth={1.5} /> Add Pessoa
        </button>
      )}
      {adding && <AddPersonDialog kind={kind} id={id} workspaces={workspaces} onClose={() => setAdding(false)} />}
    </section>
  );
}

function AddPersonDialog({ kind, id, workspaces, onClose }: { kind: "folder" | "document"; id: string; workspaces: FolderOption[]; onClose: () => void }) {
  const [mode, setMode] = useState<"person" | "workspace">("person");
  const [email, setEmail] = useState("");
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? "");
  const [role, setRole] = useState<Role>("VIEWER");
  const [error, setError] = useState<string>();
  const { run, pending } = useRun();

  return (
    <Dialog open onClose={onClose} title="Compartilhar" description="Quem receber acesso verá este item e tudo o que estiver dentro dele.">
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          setError(undefined);
          run(
            () => (mode === "person" ? shareWithPerson({ kind, id, email, role }) : shareWithWorkspace({ kind, id, workspaceId, role })),
            onClose,
            setError,
          );
        }}
      >
        {workspaces.length > 0 && (
          <div className="flex gap-2" role="radiogroup" aria-label="Compartilhar com">
            {(
              [
                ["person", "Uma pessoa"],
                ["workspace", "Um workspace"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={mode === value}
                onClick={() => setMode(value)}
                className={mode === value ? "rounded-full bg-chip px-4 py-1.5 text-body-sm font-medium text-on-light" : "rounded-full px-4 py-1.5 text-body-sm text-ink-muted hover:bg-surface"}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {mode === "person" ? (
          <Input label="E-mail da pessoa" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@empresa.com" autoFocus required />
        ) : (
          <Select label="Workspace" value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)}>
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label}
              </option>
            ))}
          </Select>
        )}
        <Select label="Perfil de acesso" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          <option value="VIEWER">Viewer — visualizar e baixar</option>
          <option value="WRITER">Writer — também enviar arquivos e comparar</option>
          <option value="EDITOR">Editor — também editar, mover e compartilhar</option>
          <option value="OWNER">Owner — controle total</option>
        </Select>
        <FormError message={error} />
        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="brand" loading={pending}>
            Compartilhar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

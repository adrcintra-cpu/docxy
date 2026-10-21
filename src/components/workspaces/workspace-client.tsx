"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@prisma/client";
import { Copy, List, Mail, Pencil, Trash2, UserPlus, Users, X } from "lucide-react";
import {
  addWorkspaceMember,
  createWorkspace,
  deleteWorkspace,
  inviteToOrganization,
  removeWorkspaceMember,
  revokeInvitation,
  setWorkspaceActive,
  updateWorkspace,
  updateWorkspaceMember,
} from "@/app/actions/workspaces";
import { Button } from "@/components/ui/button";
import { Dialog, FormError } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import { toast } from "@/components/ui/toast";
import { useRun } from "@/components/documents/item-actions";
import { ROLE_LABEL } from "@/lib/auth/permissions";

const ROLE_HELP: Record<Exclude<Role, "ADMIN">, string> = {
  VIEWER: "Viewer — visualizar e baixar",
  WRITER: "Writer — também enviar arquivos e comparar",
  EDITOR: "Editor — também editar, mover e compartilhar",
  OWNER: "Owner — também gerenciar o workspace e convidar",
};

// ─── Criar / editar ─────────────────────────────────────────────────────

export function CreateWorkspaceButton({ disabledReason }: { disabledReason?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" disabled={Boolean(disabledReason)} title={disabledReason} onClick={() => setOpen(true)}>
        <Users className="size-4" /> Criar workspace
      </Button>
      {open && <WorkspaceDialog onClose={() => setOpen(false)} />}
    </>
  );
}

export function EditWorkspaceButton({ id, name, description }: { id: string; name: string; description: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="size-4" /> Editar
      </Button>
      {open && <WorkspaceDialog id={id} initialName={name} initialDescription={description ?? ""} onClose={() => setOpen(false)} />}
    </>
  );
}

function WorkspaceDialog({ id, initialName = "", initialDescription = "", onClose }: { id?: string; initialName?: string; initialDescription?: string; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [error, setError] = useState<string>();
  const { run, pending } = useRun();
  return (
    <Dialog open onClose={onClose} title={id ? "Editar workspace" : "Novo workspace"} description={id ? undefined : "Você entra como Owner e pode convidar o time em seguida."}>
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          setError(undefined);
          run(
            async () => {
              if (id) return updateWorkspace(id, { name, description });
              const res = await createWorkspace({ name, description });
              if (res.ok && res.data) router.push(`/workspaces/${res.data.id}`);
              return res;
            },
            onClose,
            setError,
          );
        }}
      >
        <Input label="Nome do time" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={80} required />
        <div className="flex flex-col gap-2">
          <label htmlFor="ws-description" className="text-label text-ink-muted">
            Descrição (opcional)
          </label>
          <textarea
            id="ws-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={500}
            className="w-full rounded-sm border border-line bg-sunken px-3 py-2 text-body text-ink focus:border-brand focus:outline-none"
          />
        </div>
        <FormError message={error} />
        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="brand" loading={pending} disabled={name.trim().length < 2}>
            {id ? "Salvar" : "Criar workspace"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ─── Linha da tabela (referência 11) ────────────────────────────────────

export function WorkspaceRowActions({ id, name, active, canManage }: { id: string; name: string; active: boolean; canManage: boolean }) {
  const router = useRouter();
  const { run, pending } = useRun();
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <td className="px-4 text-center">
        <div className="flex justify-center">
          <Toggle checked={active} disabled={!canManage || pending} label={`${active ? "Desativar" : "Ativar"} ${name}`} onChange={(next) => run(() => setWorkspaceActive(id, next))} />
        </div>
      </td>
      <td className="pl-4 pr-6">
        <div className="flex items-center justify-center gap-2">
          <button type="button" onClick={() => router.push(`/workspaces/${id}`)} aria-label={`Membros de ${name}`} title="Membros e convites" className="flex size-9 items-center justify-center rounded-full text-ink-muted hover:bg-sunken hover:text-ink">
            <List className="size-5" strokeWidth={1.5} />
          </button>
          {canManage && (
            <button type="button" onClick={() => setConfirming(true)} aria-label={`Excluir ${name}`} title="Excluir" className="flex size-9 items-center justify-center rounded-full text-ink-muted hover:bg-sunken hover:text-[#f0a3a2]">
              <Trash2 className="size-5" strokeWidth={1.5} />
            </button>
          )}
        </div>
        {confirming && (
          <Dialog open onClose={() => setConfirming(false)} title={`Excluir ${name}?`} description="Os membros perdem o acesso. Pastas e documentos não são apagados; o workspace precisa estar sem pastas.">
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Cancelar
              </Button>
              <Button variant="danger" loading={pending} onClick={() => run(() => deleteWorkspace(id), () => setConfirming(false))}>
                Excluir workspace
              </Button>
            </div>
          </Dialog>
        )}
      </td>
    </>
  );
}

// ─── Membros e convites ─────────────────────────────────────────────────

export function MemberRoleSelect({ workspaceId, userId, name, role, editable }: { workspaceId: string; userId: string; name: string; role: Role; editable: boolean }) {
  const { run, pending } = useRun();
  if (!editable) return <span className="text-body-sm text-ink-muted">{ROLE_LABEL[role]}</span>;
  return (
    <select
      aria-label={`Perfil de ${name}`}
      value={role}
      disabled={pending}
      onChange={(e) => run(() => updateWorkspaceMember(workspaceId, userId, e.target.value as Role))}
      className="rounded-sm border border-line bg-sunken px-2 py-1.5 text-body-sm text-ink focus:border-brand focus:outline-none"
    >
      {(["VIEWER", "WRITER", "EDITOR", "OWNER"] as const).map((r) => (
        <option key={r} value={r}>
          {ROLE_LABEL[r]}
        </option>
      ))}
    </select>
  );
}

export function RemoveMemberButton({ workspaceId, userId, name, self }: { workspaceId: string; userId: string; name: string; self: boolean }) {
  const router = useRouter();
  const { run, pending } = useRun();
  return (
    <Button
      size="sm"
      variant="ghost"
      loading={pending}
      onClick={() => run(() => removeWorkspaceMember(workspaceId, userId), self ? () => router.push("/workspaces") : undefined)}
      aria-label={self ? "Sair do workspace" : `Remover ${name}`}
    >
      <X className="size-4" /> {self ? "Sair" : "Remover"}
    </Button>
  );
}

export function RevokeInviteButton({ id }: { id: string }) {
  const { run, pending } = useRun();
  return (
    <Button size="sm" variant="ghost" loading={pending} onClick={() => run(() => revokeInvitation(id))}>
      Cancelar convite
    </Button>
  );
}

/** "Adicionar pessoa": membro da organização entra direto; quem não é recebe um convite. */
export function AddMemberButton({ workspaceId, maxRole }: { workspaceId: string; maxRole: Role }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <UserPlus className="size-4" /> Adicionar pessoa
      </Button>
      {open && (
        <InviteDialog
          title="Adicionar ao workspace"
          description="Quem já está na organização entra na hora. Quem ainda não está recebe um convite válido por 7 dias."
          roles={(["VIEWER", "WRITER", "EDITOR", "OWNER"] as const).filter((r) => RANK[r] <= RANK[maxRole])}
          onSubmit={(email, role) => addWorkspaceMember(workspaceId, { email, role })}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

export function InviteToOrgButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        <Mail className="size-4" /> Convidar para a organização
      </Button>
      {open && (
        <InviteDialog
          title="Convidar para a organização"
          description="A pessoa entra na organização com o perfil escolhido. Convite válido por 7 dias."
          roles={["VIEWER", "WRITER", "EDITOR", "OWNER", "ADMIN"]}
          onSubmit={async (email, role) => {
            const res = await inviteToOrganization({ email, role });
            return res.ok ? { ...res, data: res.data ? { kind: "invited" as const, ...res.data } : undefined } : res;
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

const RANK: Record<Role, number> = { VIEWER: 0, WRITER: 1, EDITOR: 2, OWNER: 3, ADMIN: 4 };

type InviteResult = { ok: true; data?: { kind: "added" } | { kind: "invited"; link: string; emailSent: boolean }; message?: string } | { ok: false; error: string };

function InviteDialog({
  title,
  description,
  roles,
  onSubmit,
  onClose,
}: {
  title: string;
  description: string;
  roles: readonly Role[];
  onSubmit: (email: string, role: Role) => Promise<InviteResult>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("VIEWER");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [invite, setInvite] = useState<{ link: string; emailSent: boolean }>();

  if (invite) {
    return (
      <Dialog open onClose={onClose} title="Convite criado">
        <p className="text-body-sm text-ink-muted">
          {invite.emailSent
            ? `Enviamos um e-mail para ${email}. Você também pode mandar o link abaixo.`
            : `Envie o link abaixo para ${email}. A pessoa entra com a conta desse e-mail e aceita o convite.`}
        </p>
        <div className="flex items-center gap-2 rounded-sm border border-line bg-sunken p-2">
          <input readOnly value={invite.link} aria-label="Link do convite" onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 bg-transparent px-1 text-body-sm text-ink focus:outline-none" />
          <Button
            size="sm"
            variant="primary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(invite.link);
                toast("Link copiado.");
              } catch {
                toast("Selecione o link e copie manualmente.", "error");
              }
            }}
          >
            <Copy className="size-4" /> Copiar
          </Button>
        </div>
        <div className="flex justify-end">
          <Button variant="brand" onClick={onClose}>
            Concluir
          </Button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog open onClose={onClose} title={title} description={description}>
      <form
        className="flex flex-col gap-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(undefined);
          setPending(true);
          const res = await onSubmit(email, role);
          setPending(false);
          if (!res.ok) return setError(res.error);
          router.refresh();
          if (res.data?.kind === "invited") return setInvite({ link: res.data.link, emailSent: res.data.emailSent });
          if (res.message) toast(res.message);
          onClose();
        }}
      >
        <Input label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@empresa.com" autoFocus required />
        <Select label="Perfil" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {roles.map((r) => (
            <option key={r} value={r}>
              {r === "ADMIN" ? "Administrador — gerencia a organização inteira" : ROLE_HELP[r]}
            </option>
          ))}
        </Select>
        <FormError message={error} />
        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="brand" loading={pending}>
            Adicionar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Folder, Undo2, Users } from "lucide-react";
import { getCtx, requireWorkspace } from "@/lib/access";
import { can, ROLE_LABEL } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { formatDate } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { StatusChip } from "@/components/ui/status-chip";
import {
  AddMemberButton,
  EditWorkspaceButton,
  MemberRoleSelect,
  RemoveMemberButton,
  RevokeInviteButton,
} from "@/components/workspaces/workspace-client";

export const metadata: Metadata = { title: "Workspace" };

export default async function WorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getCtx();
  let access;
  try {
    access = await requireWorkspace(ctx, id, "document.read");
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  const { workspace, role } = access;
  const canManage = can(role, "workspace.manage");
  const canInvite = can(role, "member.invite");

  const [members, invitations, folders] = await Promise.all([
    db.workspaceMember.findMany({
      where: { workspaceId: workspace.id },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }], // enum em ordem: Admin, Owner, Editor…
      select: { role: true, createdAt: true, user: { select: { id: true, name: true, email: true } } },
    }),
    canInvite
      ? db.invitation.findMany({
          where: { workspaceId: workspace.id, status: "PENDING", expiresAt: { gt: new Date() } },
          orderBy: { createdAt: "desc" },
          select: { id: true, email: true, role: true, expiresAt: true },
        })
      : Promise.resolve([]),
    db.folder.findMany({ where: { workspaceId: workspace.id, parentId: null, deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <>
      <section className="flex flex-wrap items-center gap-4 rounded-lg bg-surface p-4 shadow-panel sm:p-6 lg:px-12">
        <Users className="size-8 text-ink-muted" strokeWidth={1.5} />
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-3 text-title font-semibold">
            {workspace.name}
            {!workspace.active && <StatusChip tone="removed">Desativado</StatusChip>}
          </h1>
          {workspace.description && <p className="mt-1 max-w-3xl text-body-sm text-ink-muted">{workspace.description}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {canManage && <EditWorkspaceButton id={workspace.id} name={workspace.name} description={workspace.description} />}
          {canInvite && <AddMemberButton workspaceId={workspace.id} maxRole={role} />}
          <Link href="/workspaces" className="flex items-center gap-2 text-body text-ink-muted hover:text-ink">
            <Undo2 className="size-5" strokeWidth={1.5} /> Voltar
          </Link>
        </div>
      </section>

      <div className="grid flex-1 gap-6 lg:grid-cols-[1fr_360px]">
        <section className="flex flex-col gap-4 rounded-lg bg-surface p-6" aria-label="Membros">
          <h2 className="text-body font-semibold">
            Membros <span className="font-normal text-ink-muted">({members.length})</span>
          </h2>
          <ul className="flex flex-col divide-y divide-line/50">
            {members.map((m) => {
              const self = m.user.id === ctx.userId;
              const name = m.user.name ?? m.user.email;
              return (
                <li key={m.user.id} className="flex flex-wrap items-center gap-4 py-3">
                  <Avatar id={m.user.id} name={name} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body-sm font-medium">
                      {name} {self && <span className="text-ink-muted">(você)</span>}
                    </p>
                    <p className="truncate text-label text-ink-muted">{m.user.email}</p>
                  </div>
                  <MemberRoleSelect workspaceId={workspace.id} userId={m.user.id} name={name} role={m.role} editable={canManage && !self} />
                  {(canManage || self) && <RemoveMemberButton workspaceId={workspace.id} userId={m.user.id} name={name} self={self} />}
                </li>
              );
            })}
          </ul>

          {invitations.length > 0 && (
            <>
              <h2 className="mt-4 text-body font-semibold">Convites pendentes</h2>
              <ul className="flex flex-col divide-y divide-line/50">
                {invitations.map((inv) => (
                  <li key={inv.id} className="flex flex-wrap items-center gap-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body-sm">{inv.email}</p>
                      <p className="text-label text-ink-muted">
                        {ROLE_LABEL[inv.role]} · expira em {formatDate(inv.expiresAt)}
                      </p>
                    </div>
                    <RevokeInviteButton id={inv.id} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <aside className="flex flex-col gap-4 self-start rounded-lg bg-surface p-6">
          <h2 className="text-body font-semibold">Pastas do workspace</h2>
          {folders.length === 0 ? (
            <p className="text-body-sm text-ink-muted">Nenhuma pasta ainda. Ao criar uma pasta de trabalho no início, escolha este workspace em “Quem acessa”.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {folders.map((f) => (
                <li key={f.id}>
                  <Link href={`/pastas/${f.id}`} className="flex items-center gap-3 rounded-sm px-2 py-2 text-body-sm hover:bg-sunken">
                    <Folder className="size-5 text-brand" strokeWidth={1.5} /> {f.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="text-label text-ink-subtle">Criado em {formatDate(workspace.createdAt)}. Seu perfil: {ROLE_LABEL[role]}.</p>
        </aside>
      </div>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";
import { getCtx } from "@/lib/access";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { AvatarStack } from "@/components/ui/avatar";
import { SearchField } from "@/components/ui/search-field";
import { UnavailableState } from "@/components/ui/card";
import { CreateWorkspaceButton, InviteToOrgButton, WorkspaceRowActions } from "@/components/workspaces/workspace-client";
import type { SearchParams } from "@/lib/queries/params";

export const metadata: Metadata = { title: "Workspaces" };

/** Lista de workspaces (referência 11). Administradores veem todos; os demais, os seus. */
export default async function WorkspacesPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getCtx();
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 80) || undefined;
  const isAdmin = ctx.orgRole === "ADMIN";

  const workspaces = await db.workspace.findMany({
    where: {
      organizationId: ctx.orgId,
      deletedAt: null,
      ...(isAdmin ? {} : { members: { some: { userId: ctx.userId } } }),
      ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      active: true,
      createdAt: true,
      _count: { select: { members: true } },
      members: { take: 3, orderBy: { createdAt: "asc" }, select: { role: true, userId: true, user: { select: { id: true, name: true, email: true } } } },
    },
  });
  const myRoles = new Map(
    (await db.workspaceMember.findMany({ where: { userId: ctx.userId, workspaceId: { in: workspaces.map((w) => w.id) } }, select: { workspaceId: true, role: true } })).map((m) => [m.workspaceId, m.role]),
  );

  return (
    <>
      <section className="grid items-center gap-4 rounded-lg bg-surface p-4 shadow-panel sm:p-6 lg:grid-cols-[auto_1fr_auto] lg:gap-8 lg:px-12">
        <h1 className="text-title font-semibold">Workspace</h1>
        <SearchField action="/workspaces" defaultValue={q} placeholder="O que procura?" />
        <div className="flex flex-wrap items-center gap-3">
          {can(ctx.orgRole, "member.manage") && <InviteToOrgButton />}
          <CreateWorkspaceButton disabledReason={can(ctx.orgRole, "workspace.create") ? undefined : "Peça a um administrador para criar workspaces."} />
        </div>
      </section>

      {workspaces.length === 0 ? (
        <UnavailableState
          className="min-h-64"
          title={q ? "Nenhum workspace encontrado" : "Nenhum workspace ainda"}
          description={q ? "Tente outro nome." : "Workspaces reúnem um time, suas pastas e permissões. Crie o primeiro para convidar pessoas."}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="mx-auto w-full min-w-[820px] max-w-[1400px] border-separate border-spacing-y-2 text-left">
            <thead>
              <tr className="text-label text-ink-muted">
                <th className="px-6 py-2 font-medium">Nome</th>
                <th className="px-4 py-2 text-center font-medium">Usuários</th>
                <th className="px-4 py-2 text-center font-medium">Data de criação</th>
                <th className="px-4 py-2 text-center font-medium">Habilitar grupo?</th>
                <th className="px-4 py-2 text-center font-medium">Ação</th>
              </tr>
            </thead>
            <tbody className="text-body tabular-nums">
              {workspaces.map((w) => {
                const role = isAdmin ? "ADMIN" : myRoles.get(w.id);
                return (
                  <tr key={w.id} className="bg-surface [&>td:first-child]:rounded-l-md [&>td:last-child]:rounded-r-md">
                    <td className="px-6 py-4">
                      <Link href={`/workspaces/${w.id}`} className="flex items-center gap-3 hover:underline">
                        <Users className="size-6 shrink-0 text-ink-muted" strokeWidth={1.5} />
                        <span className={w.active ? "" : "text-ink-muted"}>{w.name}</span>
                      </Link>
                    </td>
                    <td className="px-4">
                      <div className="flex justify-center">
                        <AvatarStack people={w.members.map((m) => ({ id: m.user.id, name: m.user.name ?? m.user.email }))} max={3} size={36} />
                        {w._count.members > 3 && <span className="ml-2 self-center text-body-sm">+ {w._count.members - 3}</span>}
                      </div>
                    </td>
                    <td className="px-4 text-center">{formatDate(w.createdAt)}</td>
                    <WorkspaceRowActions id={w.id} name={w.name} active={w.active} canManage={can(role, "workspace.manage")} />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

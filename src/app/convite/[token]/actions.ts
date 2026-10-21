"use server";

import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireUser, ACTIVE_ORG_COOKIE } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/errors";

export async function acceptInvitation(token: string): Promise<ActionResult> {
  const user = await requireUser();
  const tokenHash = createHash("sha256").update(String(token)).digest("hex");
  const invite = await db.invitation.findUnique({ where: { tokenHash } });

  if (!invite || invite.status !== "PENDING" || invite.expiresAt < new Date()) {
    return { ok: false, error: "Este convite não está mais válido." };
  }
  if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
    await audit({ event: "invite.accept", result: "DENIED", userId: user.id, organizationId: invite.organizationId });
    return { ok: false, error: `Este convite foi enviado para ${invite.email}.` };
  }

  // Com workspace: entra na organização como Viewer e no workspace com o papel do convite.
  const orgRole = invite.workspaceId ? "VIEWER" : invite.role;
  await db.$transaction(async (tx) => {
    const existing = await tx.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: invite.organizationId, userId: user.id } },
    });
    if (!existing) {
      await tx.organizationMember.create({ data: { organizationId: invite.organizationId, userId: user.id, role: orgRole } });
    } else if (!existing.active) {
      await tx.organizationMember.update({ where: { id: existing.id }, data: { active: true } });
    }
    if (invite.workspaceId) {
      await tx.workspaceMember.upsert({
        where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId: user.id } },
        update: { role: invite.role },
        create: { workspaceId: invite.workspaceId, userId: user.id, role: invite.role },
      });
    }
    await tx.invitation.update({ where: { id: invite.id }, data: { status: "ACCEPTED", acceptedAt: new Date() } });
  });

  await audit({ event: "invite.accept", result: "SUCCESS", userId: user.id, organizationId: invite.organizationId });
  (await cookies()).set(ACTIVE_ORG_COOKIE, invite.organizationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect(invite.workspaceId ? `/workspaces/${invite.workspaceId}` : "/");
}

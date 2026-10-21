"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCtx } from "@/lib/access";

export async function markAllNotificationsRead() {
  const ctx = await getCtx();
  await db.notification.updateMany({
    where: { userId: ctx.userId, organizationId: ctx.orgId, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/", "layout");
}

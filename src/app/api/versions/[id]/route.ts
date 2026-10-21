import { NextResponse, type NextRequest } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getCtx, requireDocument } from "@/lib/access";
import { createDownloadUrl } from "@/lib/storage";
import { ForbiddenError } from "@/lib/auth/session";
import { NotFoundError } from "@/lib/errors";

/**
 * Abre (?download=0) ou baixa (?download=1) uma versão. Verifica a permissão,
 * registra o acesso e redireciona para uma URL assinada que expira em 60 s.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const download = request.nextUrl.searchParams.get("download") === "1";
  try {
    const ctx = await getCtx();
    const version = await db.documentVersion.findFirst({
      where: { id, stage: { notIn: ["UPLOADING", "FAILED"] }, document: { organizationId: ctx.orgId } },
      select: { id: true, documentId: true, storagePath: true, fileName: true },
    });
    if (!version) throw new NotFoundError("Versão");
    await requireDocument(ctx, version.documentId, download ? "document.download" : "document.read");

    const url = await createDownloadUrl(version.storagePath, version.fileName, download);
    await Promise.all([
      db.documentVersion.update({ where: { id: version.id }, data: { lastViewedAt: new Date() } }),
      db.recentItem.upsert({
        where: { userId_documentId: { userId: ctx.userId, documentId: version.documentId } },
        update: { accessedAt: new Date() },
        create: { userId: ctx.userId, documentId: version.documentId },
      }),
      audit({
        event: download ? "document.download" : "document.view",
        result: "SUCCESS",
        userId: ctx.userId,
        organizationId: ctx.orgId,
        documentId: version.documentId,
        versionId: version.id,
      }),
    ]);
    return NextResponse.redirect(url, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    unstable_rethrow(err);
    const status = err instanceof ForbiddenError ? 403 : err instanceof NotFoundError ? 404 : 500;
    if (status === 500) console.error("[versions]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: status === 403 ? "Sem permissão" : status === 404 ? "Não encontrado" : "Erro" }, { status });
  }
}

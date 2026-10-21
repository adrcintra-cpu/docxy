import { NextResponse, type NextRequest } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getCtx, requireDocument } from "@/lib/access";
import { ForbiddenError } from "@/lib/auth/session";
import { CHANGE_LABEL, type ChangeType, type CompareMetrics } from "@/lib/compare/types";

/** Exporta a lista de mudanças em CSV (abre no Excel), com as métricas no cabeçalho. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const ctx = await getCtx();
    const cmp = await db.comparison.findFirst({
      where: { id, organizationId: ctx.orgId, status: "DONE" },
      include: {
        baseVersion: { select: { documentId: true, versionNumber: true, document: { select: { title: true } } } },
        revisedVersion: { select: { documentId: true, versionNumber: true, document: { select: { title: true } } } },
        changes: { orderBy: { position: "asc" } },
      },
    });
    if (!cmp) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    await requireDocument(ctx, cmp.baseVersion.documentId, "document.download");
    await requireDocument(ctx, cmp.revisedVersion.documentId, "document.download");

    const m = cmp.metrics as unknown as CompareMetrics;
    const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const vs = (n: number) => `vs${String(n).padStart(2, "0")}`;
    const lines = [
      ["Original", `${cmp.baseVersion.document.title} ${vs(cmp.baseVersion.versionNumber)}`],
      ["Revisado", `${cmp.revisedVersion.document.title} ${vs(cmp.revisedVersion.versionNumber)}`],
      ["Percentual de diferença", `${m.differencePercent}%`],
      ["Critério", m.formula],
      [],
      ["Nº", "Tipo", "Relevante", "Trecho original", "Trecho revisado", "Página original", "Página revisada", "Revisão"],
      ...cmp.changes.map((c) => [
        c.position,
        CHANGE_LABEL[c.type as ChangeType],
        c.relevant ? "sim" : "não",
        c.baseText,
        c.revisedText,
        c.basePage,
        c.revisedPage,
        c.reviewStatus === "REVIEWED" ? "revisada" : c.reviewStatus === "DISMISSED" ? "ignorada" : "pendente",
      ]),
    ];
    const csv = "﻿" + lines.map((l) => l.map(q).join(";")).join("\r\n");
    await audit({ event: "comparison.export", result: "SUCCESS", userId: ctx.userId, organizationId: ctx.orgId, metadata: { comparisonId: id } });
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="comparacao-${id.slice(0, 8)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    unstable_rethrow(err);
    return NextResponse.json({ error: err instanceof ForbiddenError ? "Sem permissão" : "Erro" }, { status: err instanceof ForbiddenError ? 403 : 500 });
  }
}

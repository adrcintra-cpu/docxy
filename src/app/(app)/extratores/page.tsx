import type { Metadata } from "next";
import { getCtx } from "@/lib/access";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { providerInfo } from "@/lib/ai/provider";
import { getExtractors } from "@/lib/extract/server";
import { AISettings, ExtractorList } from "@/components/extract/extractor-admin";

export const metadata: Metadata = { title: "Extrator" };

export default async function ExtractorsPage() {
  const ctx = await getCtx();
  const canManage = can(ctx.orgRole, "extractor.manage");
  const [extractors, org] = await Promise.all([getExtractors(ctx, { includeInactive: canManage }), db.organization.findUnique({ where: { id: ctx.orgId }, select: { aiEnabled: true } })]);
  const info = providerInfo();
  return (
    <section className="flex flex-1 flex-col gap-6 rounded-lg bg-surface p-6 lg:px-12">
      <div>
        <h1 className="text-title font-semibold">Extrator</h1>
        <p className="mt-1 max-w-2xl text-body-sm text-ink-muted">
          Modelos de extração de dados por tipo de documento. Abra um documento ou uma comparação e use a ferramenta Extrator para aplicar um modelo; campos sem evidência aparecem como “Não identificado” e podem ser corrigidos à mão.
        </p>
      </div>
      <AISettings provider={info.provider} model={info.model} configured={info.configured} reason={info.reason} enabled={Boolean(org?.aiEnabled)} canManage={can(ctx.orgRole, "org.manage")} />
      <ExtractorList extractors={extractors} canManage={canManage} />
    </section>
  );
}

import type { Metadata } from "next";
import { getCtx } from "@/lib/access";
import { getMoveTargets, getSharedWithMe } from "@/lib/queries/library";
import { DocumentTable } from "@/components/documents/library-views";
import { UnavailableState } from "@/components/ui/card";

export const metadata: Metadata = { title: "Compartilhados comigo" };

export default async function SharedPage() {
  const ctx = await getCtx();
  const [shared, moveTargets] = await Promise.all([getSharedWithMe(ctx), getMoveTargets(ctx)]);
  const total = shared.folders.length + shared.documents.length;
  return (
    <section className="flex flex-1 flex-col gap-6 rounded-lg bg-surface p-6 lg:px-12">
      <div>
        <h1 className="text-title font-semibold">Compartilhados comigo</h1>
        <p className="mt-1 text-body-sm text-ink-muted">Pastas e documentos que outras pessoas compartilharam diretamente com você.</p>
      </div>
      {total === 0 ? (
        <UnavailableState className="min-h-64" title="Nada compartilhado ainda" description="Quando alguém compartilhar uma pasta ou documento com você, ele aparece aqui." />
      ) : (
        <DocumentTable folders={shared.folders} documents={shared.documents} moveTargets={moveTargets} showFolder />
      )}
    </section>
  );
}

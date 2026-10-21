"use client";

import { useState, useTransition } from "react";
import { ShieldOff } from "lucide-react";
import { setDocumentAIBlocked } from "@/app/actions/extract";
import { Toggle } from "@/components/ui/toggle";
import { toast } from "@/components/ui/toast";

/** "Confidencial: não enviar à IA" — vale mesmo com a IA da organização autorizada. */
export function AIBlockToggle({ documentId, blocked, canEdit }: { documentId: string; blocked: boolean; canEdit: boolean }) {
  const [on, setOn] = useState(blocked);
  const [pending, start] = useTransition();
  return (
    <section className="flex items-start gap-3">
      <ShieldOff className="mt-0.5 size-5 shrink-0 text-ink-muted" strokeWidth={1.5} />
      <div className="min-w-0 flex-1">
        <h2 className="text-body-sm font-semibold">Confidencial</h2>
        <p className="text-label text-ink-muted">Nunca enviar este documento ao provedor de IA. Extração, assistente e resumos continuam por regras.</p>
      </div>
      <Toggle
        checked={on}
        disabled={!canEdit || pending}
        label="Não enviar este documento à IA"
        onChange={(next) =>
          start(async () => {
            setOn(next);
            const res = await setDocumentAIBlocked(documentId, next);
            if (!res.ok) {
              setOn(!next);
              toast(res.error, "error");
            } else toast(res.message ?? "Salvo.");
          })
        }
      />
    </section>
  );
}

"use client";

import { useState } from "react";
import { AlignLeft, Pencil } from "lucide-react";
import type { ActionResult } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { useRun } from "./item-actions";

/** Bloco "Descrição" do painel lateral, editável por quem gerencia o item. */
export function DescriptionEditor({
  value,
  canEdit,
  onSave,
}: {
  value: string | null;
  canEdit: boolean;
  onSave: (text: string) => Promise<ActionResult<unknown>>;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value ?? "");
  const { run, pending } = useRun();

  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-body-sm text-ink-muted">
        <AlignLeft className="size-4" /> Descrição
        {canEdit && !editing && (
          <button type="button" onClick={() => setEditing(true)} aria-label="Editar descrição" className="ml-auto rounded-full p-1 hover:text-ink">
            <Pencil className="size-4" />
          </button>
        )}
      </h2>
      {editing ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => onSave(text), () => setEditing(false));
          }}
        >
          <label htmlFor="item-description" className="sr-only">
            Descrição
          </label>
          <textarea
            id="item-description"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            maxLength={2000}
            autoFocus
            className="w-full rounded-sm border border-line bg-sunken px-3 py-2 text-body-sm text-ink focus:border-brand focus:outline-none"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" variant="brand" loading={pending}>
              Salvar
            </Button>
          </div>
        </form>
      ) : (
        <p className="whitespace-pre-line text-body-sm text-ink">{value || <span className="text-ink-subtle">Sem descrição.</span>}</p>
      )}
    </section>
  );
}

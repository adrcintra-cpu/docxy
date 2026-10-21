"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import { saveExtractor, setExtractorActive, setOrganizationAI } from "@/app/actions/extract";
import type { ExtractorView } from "@/lib/extract/server";
import { FIELD_TYPE_LABEL, FIELD_TYPES, type FieldDef, type FieldType } from "@/lib/extract/types";
import { Button } from "@/components/ui/button";
import { Dialog, FormError } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/** Autorização de IA da organização. */
export function AISettings({ provider, model, configured, reason, enabled, canManage }: { provider: string; model?: string; configured: boolean; reason?: string; enabled: boolean; canManage: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [pending, start] = useTransition();
  const change = (next: boolean) =>
    start(async () => {
      setOn(next);
      const res = await setOrganizationAI(next);
      if (!res.ok) {
        setOn(!next);
        return toast(res.error, "error");
      }
      toast(res.message ?? "Salvo.");
      router.refresh();
    });
  return (
    <section className="flex flex-col gap-4 rounded-md bg-sunken p-5 md:flex-row md:items-start">
      <Sparkles className="size-6 shrink-0 text-brand" strokeWidth={1.5} />
      <div className="min-w-0 flex-1">
        <h2 className="text-body font-semibold">Configurações de IA</h2>
        <p className="mt-1 max-w-3xl text-body-sm text-ink-muted">
          Extração, assistente e resumos funcionam sempre por regras, sem enviar nada para fora. Com a IA autorizada, o texto dos documentos abertos é enviado ao provedor configurado no servidor para complementar campos não identificados, responder perguntas e redigir resumos — sempre com trechos de origem verificados. Documentos marcados como confidenciais nunca são enviados.
        </p>
        <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-label text-ink-muted">
          <span>
            Provedor: <b className="text-ink">{configured ? `${provider}${model ? ` · ${model}` : ""}` : "não configurado"}</b>
          </span>
          {!configured && reason && <span>{reason}</span>}
          <span className="flex items-center gap-1">
            <ShieldCheck className="size-3.5" /> Chaves ficam só no servidor
          </span>
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-body-sm text-ink-muted">{on ? "Autorizada" : "Desligada"}</span>
        <Toggle checked={on} onChange={change} label="Autorizar IA para a organização" disabled={pending || !canManage || (!configured && !on)} />
      </div>
      {!canManage && <p className="text-label text-ink-subtle md:hidden">Só administradores da organização mudam esta opção.</p>}
    </section>
  );
}

/** Lista de extratores com edição (para quem gerencia) e ativação. */
export function ExtractorList({ extractors, canManage }: { extractors: ExtractorView[]; canManage: boolean }) {
  const [editing, setEditing] = useState<ExtractorView | "new" | null>(null);
  const router = useRouter();
  const [, start] = useTransition();
  const toggle = (x: ExtractorView) =>
    start(async () => {
      const res = await setExtractorActive(x.id, !x.active);
      if (!res.ok) return toast(res.error, "error");
      toast(res.message ?? "Salvo.");
      router.refresh();
    });
  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-body font-semibold">Extratores</h2>
        {canManage && (
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="size-4" /> Novo extrator
          </Button>
        )}
      </div>
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {extractors.map((x) => (
          <li key={x.id} className={cn("lift flex flex-col gap-3 rounded-md bg-sunken p-5", !x.active && "opacity-60")}>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="text-body">{x.name}</h3>
                <p className="text-label text-ink-subtle">
                  {x.documentKind} · {x.fields.length} campos{x.template ? " · modelo padrão" : ""}
                  {!x.active ? " · desativado" : ""}
                </p>
              </div>
              {canManage && (
                <button type="button" onClick={() => setEditing(x)} aria-label={`Editar ${x.name}`} className="rounded-full p-1 text-ink-muted hover:text-ink">
                  <Pencil className="size-4" />
                </button>
              )}
            </div>
            {x.description && <p className="text-body-sm text-ink-muted">{x.description}</p>}
            <ul className="flex flex-wrap gap-1">
              {x.fields.map((f) => (
                <li key={f.key} className={cn("rounded-full px-2 py-0.5 text-[11px]", f.important ? "bg-brand/90 text-on-light" : "bg-page text-ink-muted")} title={FIELD_TYPE_LABEL[f.type]}>
                  {f.label}
                </li>
              ))}
            </ul>
            {canManage && (
              <button type="button" onClick={() => toggle(x)} className="mt-auto self-start text-label text-accent-strong hover:text-ink">
                {x.active ? "Desativar" : "Ativar"}
              </button>
            )}
          </li>
        ))}
      </ul>
      {editing && <ExtractorEditor extractor={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

type Row = { key?: string; label: string; type: FieldType; aliases: string; important: boolean };

function ExtractorEditor({ extractor, onClose }: { extractor: ExtractorView | null; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(extractor?.name ?? "");
  const [kind, setKind] = useState(extractor?.documentKind ?? "contrato");
  const [description, setDescription] = useState(extractor?.description ?? "");
  const [rows, setRows] = useState<Row[]>(
    extractor?.fields.map((f: FieldDef) => ({ key: f.key, label: f.label, type: f.type, aliases: f.aliases.join(", "), important: Boolean(f.important) })) ?? [{ label: "", type: "text", aliases: "", important: false }],
  );
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const set = (i: number, patch: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const submit = () =>
    start(async () => {
      setError(undefined);
      const res = await saveExtractor(extractor?.id ?? null, {
        name,
        documentKind: kind,
        description: description || undefined,
        fields: rows.filter((r) => r.label.trim()).map((r) => ({ key: r.key, label: r.label, type: r.type, aliases: r.aliases.split(",").map((a) => a.trim()).filter(Boolean), important: r.important })),
      });
      if (!res.ok) return setError(res.error);
      toast(res.message ?? "Salvo.");
      onClose();
      router.refresh();
    });

  return (
    <Dialog open onClose={onClose} title={extractor ? `Editar ${extractor.name}` : "Novo extrator"} description="Campos com a mesma chave são comparados lado a lado no dashboard." className="w-[min(760px,calc(100vw-32px))]">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Nome" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
          <Input label="Tipo de documento" value={kind} onChange={(e) => setKind(e.target.value)} required maxLength={40} />
        </div>
        <Input label="Descrição (opcional)" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-label text-ink-muted">Campos · rótulos são as palavras que antecedem o valor no documento, separadas por vírgula</legend>
          <div className="max-h-[42vh] overflow-y-auto pr-1">
            {rows.map((r, i) => (
              <div key={i} className="mb-2 grid grid-cols-[1fr_auto] gap-2 rounded-sm bg-sunken p-2 sm:grid-cols-[1.2fr_1fr_1.6fr_auto_auto] sm:items-center">
                <input aria-label="Nome do campo" placeholder="Nome do campo" value={r.label} onChange={(e) => set(i, { label: e.target.value })} maxLength={80} className="h-9 rounded-sm bg-page px-2 text-body-sm focus:outline-none focus:ring-1 focus:ring-brand" />
                <select aria-label="Tipo" value={r.type} onChange={(e) => set(i, { type: e.target.value as FieldType })} className="h-9 rounded-sm bg-page px-2 text-body-sm focus:outline-none focus:ring-1 focus:ring-brand">
                  {FIELD_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {FIELD_TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
                <input aria-label="Rótulos no documento" placeholder="Ex.: prêmio, valor do prêmio" value={r.aliases} onChange={(e) => set(i, { aliases: e.target.value })} className="col-span-2 h-9 rounded-sm bg-page px-2 text-body-sm focus:outline-none focus:ring-1 focus:ring-brand sm:col-span-1" />
                <label className="flex items-center gap-1.5 text-label text-ink-muted" title="Destacar no dashboard quando mudar">
                  <input type="checkbox" checked={r.important} onChange={(e) => set(i, { important: e.target.checked })} className="size-4 accent-[var(--color-brand)]" /> Relevante
                </label>
                <button type="button" onClick={() => setRows((x) => x.filter((_, j) => j !== i))} aria-label="Remover campo" className="justify-self-end rounded-full p-1 text-ink-muted hover:text-removed">
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setRows((r) => [...r, { label: "", type: "text", aliases: "", important: false }])} className="self-start text-label text-accent-strong hover:text-ink">
            + Adicionar campo
          </button>
        </fieldset>
        <FormError message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={pending}>
            Salvar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

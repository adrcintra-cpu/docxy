"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GitCompareArrows } from "lucide-react";
import { startComparison } from "@/app/actions/compare";
import { Button } from "@/components/ui/button";
import { Dialog, FormError } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";

export interface VersionOption {
  id: string;
  label: string;
  group: string;
  /** Motivo de não poder comparar (ainda lendo, sem texto…). */
  notReady?: string;
}

/** Escolha de duas versões (do mesmo documento ou de outros) para comparar. */
export function CompareButton({
  options,
  defaultBase,
  defaultRevised,
  disabledReason,
  label = "Comparar versões",
  variant = "primary",
}: {
  options: VersionOption[];
  defaultBase?: string;
  defaultRevised?: string;
  disabledReason?: string;
  label?: string;
  variant?: "primary" | "ghost";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} disabled={Boolean(disabledReason)} title={disabledReason} onClick={() => setOpen(true)}>
        <GitCompareArrows className="size-4" /> {label}
      </Button>
      {open && <CompareDialog options={options} defaultBase={defaultBase} defaultRevised={defaultRevised} onClose={() => setOpen(false)} />}
    </>
  );
}

export function CompareDialog({
  options,
  defaultBase,
  defaultRevised,
  onClose,
}: {
  options: VersionOption[];
  defaultBase?: string;
  defaultRevised?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const ready = options.filter((o) => !o.notReady);
  const [base, setBase] = useState(defaultBase ?? ready[1]?.id ?? ready[0]?.id ?? "");
  const [revised, setRevised] = useState(defaultRevised ?? ready[0]?.id ?? "");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const groups = [...new Set(options.map((o) => o.group))];

  const list = (value: string, onChange: (v: string) => void, label: string, id: string) => (
    <Select id={id} label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      {groups.map((g) => (
        <optgroup key={g} label={g}>
          {options
            .filter((o) => o.group === g)
            .map((o) => (
              <option key={o.id} value={o.id} disabled={Boolean(o.notReady)}>
                {o.label}
                {o.notReady ? ` — ${o.notReady}` : ""}
              </option>
            ))}
        </optgroup>
      ))}
    </Select>
  );

  return (
    <Dialog open onClose={onClose} title="Comparar documentos" description="O original aparece à esquerda e o revisado à direita, com as diferenças destacadas.">
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          setError(undefined);
          start(async () => {
            const res = await startComparison(base, revised);
            if (!res.ok) return setError(res.error);
            router.push(`/comparar/${res.data!.id}`);
          });
        }}
      >
        {list(base, setBase, "Documento original", "cmp-base")}
        {list(revised, setRevised, "Documento revisado", "cmp-revised")}
        {ready.length < 2 && <p className="text-body-sm text-ink-muted">É preciso ter duas versões já lidas. Envie uma nova versão ou aguarde a leitura terminar.</p>}
        <FormError message={error} />
        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="brand" loading={pending} disabled={!base || !revised || base === revised}>
            Comparar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

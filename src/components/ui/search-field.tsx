import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchFieldProps {
  name?: string;
  placeholder?: string;
  defaultValue?: string;
  action?: string;
  className?: string;
  /** Campos ocultos enviados junto (para manter filtros da URL). */
  hidden?: Record<string, string | undefined>;
  /** Quando definido, a busca aparece desabilitada com este motivo (funcionalidade ainda não disponível). */
  disabledReason?: string;
}

/** Busca em pílula com botão circular amarelo ("O que procura?"). Envia GET para `action`. */
export function SearchField({
  name = "q",
  placeholder = "O que procura?",
  defaultValue,
  action,
  className,
  hidden,
  disabledReason,
}: SearchFieldProps) {
  const disabled = Boolean(disabledReason);
  return (
    <form role="search" action={action} title={disabledReason} className={cn("relative flex h-12 items-center", disabled && "opacity-60", className)}>
      {Object.entries(hidden ?? {}).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <input
        type="search"
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-label={placeholder}
        disabled={disabled}
        maxLength={120}
        className="h-full w-full rounded-full bg-page pl-6 pr-16 text-body text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-brand/60"
      />
      <button
        type="submit"
        aria-label="Pesquisar"
        disabled={disabled}
        className="absolute right-1 flex size-10 items-center justify-center rounded-full bg-brand text-on-light shadow-panel transition-transform hover:scale-105"
      >
        <Search className="size-5" strokeWidth={2.25} />
      </button>
    </form>
  );
}

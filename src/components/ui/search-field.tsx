import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchFieldProps {
  name?: string;
  placeholder?: string;
  defaultValue?: string;
  action?: string;
  className?: string;
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
  disabledReason,
}: SearchFieldProps) {
  const disabled = Boolean(disabledReason);
  return (
    <form role="search" action={action} title={disabledReason} className={cn("relative flex h-12 items-center", disabled && "opacity-60", className)}>
      <input
        type="search"
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-label={placeholder}
        disabled={disabled}
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

import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Card de pasta/documento: surface + radius-md. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-md bg-surface p-4", className)} {...props} />;
}

/** Painel grande: cabeçalho, barra de ferramentas, menu lateral, modal. */
export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg bg-surface shadow-panel", className)} {...props} />;
}

/** Estado claramente identificado como ainda não disponível (princípio do brief). */
export function UnavailableState({
  title,
  description,
  phase,
  className,
}: {
  title: string;
  description?: string;
  phase?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        "relative flex flex-col items-center justify-center gap-2 overflow-hidden rounded-md border border-dashed border-line p-8 text-center",
        className,
      )}
    >
      <div className="plus-field pointer-events-none absolute inset-0" aria-hidden />
      {phase && (
        <span className="relative rounded-full bg-chip px-3 py-1 text-label font-semibold text-on-light">{phase}</span>
      )}
      <p className="relative text-title font-medium">{title}</p>
      {description && <p className="relative max-w-md text-body-sm text-ink-muted">{description}</p>}
    </div>
  );
}

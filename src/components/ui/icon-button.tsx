import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
  tone?: "plain" | "filled";
}

/** Botão só de ícone. `label` é obrigatório para leitores de tela e vira tooltip. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, active, tone = "plain", className, children, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        "inline-flex size-11 items-center justify-center rounded-full transition-colors",
        tone === "filled" ? "bg-ink-subtle text-ink hover:bg-ink-muted" : "text-ink-muted hover:text-ink",
        active && "text-brand hover:text-brand",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  ),
);
IconButton.displayName = "IconButton";

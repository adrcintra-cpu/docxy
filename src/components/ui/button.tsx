import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors duration-200 ease-out-soft disabled:pointer-events-none disabled:opacity-100 focus-visible:outline-2",
  {
    variants: {
      variant: {
        /** Pílula branca, caixa-alta espaçada — UPLOAD ARQUIVO, EXTRAIR, CRIAR WORKSPACE. */
        primary:
          "bg-paper text-on-light uppercase tracking-caps text-label hover:bg-chip hover:shadow-[0_6px_18px_-8px_rgba(255,255,255,.35)] disabled:bg-ink-disabled disabled:text-surface",
        /** Amarelo Docxy — ação principal de destaque. */
        brand: "bg-brand text-on-light uppercase tracking-caps text-label hover:brightness-95 hover:shadow-[0_6px_18px_-8px_rgba(247,236,92,.55)]",
        /** Botão ENTRAR do login. */
        login:
          "bg-login-primary text-accent-strong uppercase tracking-caps text-label hover:bg-[#21365c] disabled:text-ink-disabled",
        ghost: "text-ink-muted hover:text-ink hover:bg-surface",
        danger: "bg-removed text-ink uppercase tracking-caps text-label hover:brightness-110",
      },
      size: {
        sm: "h-9 px-4",
        md: "h-11 px-6",
        lg: "h-12 px-8 w-full",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  ),
);
Button.displayName = "Button";

export { buttonVariants };

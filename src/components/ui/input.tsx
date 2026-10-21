"use client";

import { forwardRef, useId, useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  /** "login" usa o fundo do painel de autenticação; "app" o das telas internas. */
  tone?: "login" | "app";
}

const fieldBase =
  "h-12 w-full rounded-sm border px-3 text-body text-ink placeholder:text-ink-muted transition-colors focus:outline-none focus:border-brand disabled:opacity-60";

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, tone = "app", id, ...props }, ref) => {
    const autoId = useId();
    const inputId = id ?? autoId;
    const errorId = `${inputId}-error`;
    return (
      <div className="flex flex-col gap-2">
        {label && (
          <label htmlFor={inputId} className="text-label text-ink-muted">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={cn(
            fieldBase,
            tone === "login" ? "bg-login-input border-ink-muted/60" : "bg-sunken border-line",
            error && "border-removed",
            className,
          )}
          {...props}
        />
        {error && (
          <p id={errorId} className="text-label text-[#f0807e]">
            {error}
          </p>
        )}
      </div>
    );
  },
);
Input.displayName = "Input";

export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputProps, "type">>(
  ({ className, ...props }, ref) => {
    const [visible, setVisible] = useState(false);
    return (
      <div className="relative">
        <Input ref={ref} type={visible ? "text" : "password"} className={cn("pr-11", className)} {...props} />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
          aria-pressed={visible}
          className={cn(
            "absolute right-2 flex size-8 items-center justify-center rounded-full text-ink-muted hover:text-ink",
            props.label ? "top-[30px]" : "top-2",
          )}
        >
          {visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
        </button>
      </div>
    );
  },
);
PasswordInput.displayName = "PasswordInput";

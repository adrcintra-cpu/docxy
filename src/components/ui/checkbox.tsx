import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(({ className, label, ...props }, ref) => (
  <label className={cn("inline-flex cursor-pointer items-center gap-3 text-body text-ink", className)}>
    <input
      ref={ref}
      type="checkbox"
      className="size-5 shrink-0 cursor-pointer appearance-none rounded-[4px] border border-ink-muted bg-transparent transition-colors checked:border-brand checked:bg-brand checked:bg-[url('data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2016%2016%22%3E%3Cpath%20d=%22M3.5%208.5l3%203%206-7%22%20fill=%22none%22%20stroke=%22%231f232e%22%20stroke-width=%222%22/%3E%3C/svg%3E')] checked:bg-center checked:bg-no-repeat"
      {...props}
    />
    {label && <span>{label}</span>}
  </label>
));
Checkbox.displayName = "Checkbox";

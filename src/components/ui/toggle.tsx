"use client";

import { cn } from "@/lib/utils";

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-8 w-14 rounded-full transition-colors duration-200 disabled:opacity-50",
        checked ? "bg-toggle" : "bg-ink-disabled",
      )}
    >
      <span
        className={cn(
          "absolute top-1 size-6 rounded-full bg-[#e6e8ee] shadow transition-transform duration-200 ease-out-soft",
          checked ? "translate-x-7" : "translate-x-1",
        )}
      />
    </button>
  );
}

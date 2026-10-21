"use client";

import { useEffect, useRef, useState } from "react";
import { MoreVertical } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MenuItem {
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  hint?: string;
}

/** Menu contextual ⋮ dos cards e linhas de tabela. */
export function ItemMenu({ items, label = "Ações", className }: { items: MenuItem[]; label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="flex size-8 items-center justify-center rounded-full text-ink-muted hover:bg-sunken hover:text-ink"
      >
        <MoreVertical className="size-5" />
      </button>
      {open && (
        <ul role="menu" className="absolute right-0 z-30 mt-1 min-w-48 rounded-md border border-line bg-overlay p-1 shadow-panel">
          {items.map(({ label: itemLabel, icon: Icon, onSelect, danger, disabled, hint }) => (
            <li key={itemLabel} role="none">
              <button
                type="button"
                role="menuitem"
                disabled={disabled}
                title={hint}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpen(false);
                  onSelect();
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-sm px-3 py-2 text-left text-body-sm hover:bg-surface disabled:pointer-events-none disabled:opacity-45",
                  danger ? "text-[#f0a3a2]" : "text-ink",
                )}
              >
                {Icon && <Icon className="size-4 shrink-0" />}
                {itemLabel}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Modal acessível sobre o <dialog> nativo: foco preso, Esc fecha, clique no overlay fecha. */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="dialog-title"
      className={cn(
        "m-auto w-[min(480px,calc(100vw-32px))] rounded-lg border border-line bg-overlay p-0 text-ink shadow-panel backdrop:bg-black/55 backdrop:backdrop-blur-[2px]",
        className,
      )}
    >
      {open && (
        <div className="flex flex-col gap-6 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="dialog-title" className="text-title font-semibold">
                {title}
              </h2>
              {description && <p className="mt-1 text-body-sm text-ink-muted">{description}</p>}
            </div>
            <button type="button" onClick={onClose} aria-label="Fechar" className="-mr-1 rounded-full p-1 text-ink-muted hover:text-ink">
              <X className="size-6" strokeWidth={1.5} />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

/** Mensagem de erro padrão dentro de formulários. */
export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-sm bg-removed/15 px-3 py-2 text-body-sm text-[#f0a3a2]">
      {message}
    </p>
  );
}

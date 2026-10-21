"use client";

import { useEffect, useState } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";
import { cn } from "@/lib/utils";

type Toast = { id: number; message: string; tone: "ok" | "error" };
const EVENT = "docxy:toast";

/** Mostra um aviso curto no canto da tela (de qualquer componente cliente). */
export function toast(message: string, tone: Toast["tone"] = "ok") {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { message, tone } }));
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);

  useEffect(() => {
    let seq = 0;
    const onToast = (e: Event) => {
      const { message, tone } = (e as CustomEvent<Omit<Toast, "id">>).detail;
      const id = ++seq;
      setItems((list) => [...list.slice(-2), { id, message, tone }]);
      setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), tone === "error" ? 6000 : 3500);
    };
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, []);

  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-[max(24px,env(safe-area-inset-bottom))] right-6 z-[80] flex flex-col items-end gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          role={t.tone === "error" ? "alert" : "status"}
          className={cn(
            "pointer-events-auto flex max-w-sm items-start gap-3 rounded-md border px-4 py-3 text-body-sm shadow-panel",
            t.tone === "error" ? "border-removed/40 bg-overlay text-[#f0a3a2]" : "border-line bg-overlay text-ink",
          )}
        >
          {t.tone === "error" ? <CircleAlert className="mt-0.5 size-4 shrink-0" /> : <CircleCheck className="mt-0.5 size-4 shrink-0 text-inserted" />}
          {t.message}
        </div>
      ))}
    </div>
  );
}

"use client";

import { RotateCcw } from "lucide-react";
import { retryProcessing } from "@/app/actions/upload";
import { useRun } from "./item-actions";

export function RetryProcessingButton({ versionId }: { versionId: string }) {
  const { run, pending } = useRun();
  return (
    <button type="button" disabled={pending} onClick={() => run(() => retryProcessing(versionId))} className="flex items-center gap-1 text-label text-accent-strong hover:underline disabled:opacity-50">
      <RotateCcw className="size-3" /> Tentar de novo
    </button>
  );
}

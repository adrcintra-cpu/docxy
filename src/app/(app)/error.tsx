"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const forbidden = error.name === "ForbiddenError" || error.message.startsWith("Sem permissão");

  useEffect(() => {
    if (!forbidden) console.error(error);
  }, [error, forbidden]);

  return (
    <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-4 rounded-lg bg-surface p-12 text-center">
      <h1 className="text-title font-semibold">{forbidden ? "Você não tem permissão para esta ação" : "Algo deu errado"}</h1>
      <p className="max-w-md text-body-sm text-ink-muted">
        {forbidden
          ? "Peça a um administrador da organização para ajustar seu perfil de acesso."
          : "Tente novamente. Se o problema continuar, informe o código abaixo ao suporte."}
      </p>
      {error.digest && !forbidden && <code className="text-label text-ink-subtle">{error.digest}</code>}
      {!forbidden && (
        <Button variant="primary" onClick={reset}>
          Tentar novamente
        </Button>
      )}
    </div>
  );
}

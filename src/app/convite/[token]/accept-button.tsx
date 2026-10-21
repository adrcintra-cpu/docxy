"use client";

import { useState, useTransition } from "react";
import { acceptInvitation } from "./actions";
import { Button } from "@/components/ui/button";

export function AcceptInviteButton({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <div className="mt-8 flex flex-col items-center gap-3">
      <Button
        variant="brand"
        loading={pending}
        onClick={() =>
          start(async () => {
            const res = await acceptInvitation(token);
            if (res && !res.ok) setError(res.error);
          })
        }
      >
        Aceitar convite
      </Button>
      {error && (
        <p role="alert" className="text-body-sm text-[#f0a3a2]">
          {error}
        </p>
      )}
    </div>
  );
}

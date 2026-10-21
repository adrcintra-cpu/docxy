"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset, updatePassword, type FormState } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { Input, PasswordInput } from "@/components/ui/input";

function Feedback({ state }: { state: FormState }) {
  if (state?.error)
    return (
      <p role="alert" className="rounded-sm bg-removed/15 px-3 py-2 text-body-sm text-[#f0a3a2]">
        {state.error}
      </p>
    );
  if (state?.message)
    return (
      <p role="status" className="rounded-sm bg-inserted/15 px-3 py-2 text-body-sm text-[#dbe58a]">
        {state.message}
      </p>
    );
  return null;
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(requestPasswordReset, undefined);
  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      <div>
        <h1 className="text-title font-semibold">Recuperar senha</h1>
        <p className="mt-2 text-body-sm text-ink-muted">Enviaremos um link para você criar uma nova senha.</p>
      </div>
      <Input tone="login" label="E-mail" name="email" type="email" autoComplete="email" placeholder="Digite seu e-mail" required autoFocus />
      <Feedback state={state} />
      <Button type="submit" variant="login" size="lg" loading={pending}>
        Enviar link
      </Button>
      <Link href="/login" className="text-center text-body text-accent-strong hover:underline">
        Voltar para o login
      </Link>
    </form>
  );
}

export function NewPasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(updatePassword, undefined);
  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      <div>
        <h1 className="text-title font-semibold">Criar nova senha</h1>
        <p className="mt-2 text-body-sm text-ink-muted">Mínimo de 10 caracteres, com letras e números.</p>
      </div>
      <PasswordInput tone="login" label="Nova senha" name="password" autoComplete="new-password" required autoFocus />
      <PasswordInput tone="login" label="Confirme a nova senha" name="confirm" autoComplete="new-password" required />
      <Feedback state={state} />
      <Button type="submit" variant="login" size="lg" loading={pending}>
        Salvar senha
      </Button>
    </form>
  );
}

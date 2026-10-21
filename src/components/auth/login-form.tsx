"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signInWithPassword, signInWithProvider, type FormState } from "@/app/auth/actions";
import type { OAuthProvider } from "@/lib/env";
import { Button } from "@/components/ui/button";
import { Input, PasswordInput } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { AppleIcon, GoogleIcon, MicrosoftIcon } from "./provider-icons";

const PROVIDERS: Record<OAuthProvider, { label: string; Icon: () => React.JSX.Element }> = {
  azure: { label: "Continuar com Microsoft", Icon: MicrosoftIcon },
  google: { label: "Continuar com Google", Icon: GoogleIcon },
  apple: { label: "Continuar com Apple", Icon: AppleIcon },
};

const LINK_ERRORS: Record<string, string> = {
  link: "O link é inválido ou expirou. Tente novamente.",
  oauth: "Não foi possível entrar com esse provedor. Tente novamente.",
  provider: "Esse provedor de login não está habilitado.",
};

export function LoginForm({
  providers,
  next,
  linkError,
}: {
  providers: OAuthProvider[];
  next?: string;
  linkError?: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(signInWithPassword, undefined);
  const error = state?.error ?? (linkError ? LINK_ERRORS[linkError] : undefined);

  return (
    <div className="flex flex-col gap-10">
      <form action={formAction} className="flex flex-col gap-6" noValidate>
        <input type="hidden" name="next" value={next ?? "/"} />
        <Input
          tone="login"
          label="E-mail"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="Digite seu e-mail"
          defaultValue={state?.fields?.email}
          required
          autoFocus
        />
        <div className="flex flex-col gap-4">
          <PasswordInput
            tone="login"
            label="Senha"
            name="password"
            autoComplete="current-password"
            placeholder="Digite sua senha"
            required
          />
          <div className="flex items-center justify-between gap-4">
            <Checkbox name="remember" label="Manter conectado" defaultChecked />
            <Link href="/esqueci-senha" className="text-body text-accent-strong hover:underline">
              Esqueci a senha
            </Link>
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-sm bg-removed/15 px-3 py-2 text-body-sm text-[#f0a3a2]">
            {error}
          </p>
        )}

        <Button type="submit" variant="login" size="lg" loading={pending} className="mt-4">
          Entrar
        </Button>
      </form>

      {providers.length > 0 && (
        <>
          <div className="flex items-center gap-6 text-body text-ink" aria-hidden>
            <span className="h-px flex-1 bg-ink-muted/50" />
            ou
            <span className="h-px flex-1 bg-ink-muted/50" />
          </div>
          <div className="flex flex-col gap-5">
            {providers.map((p) => {
              const { label, Icon } = PROVIDERS[p];
              return (
                <form key={p} action={signInWithProvider}>
                  <input type="hidden" name="provider" value={p} />
                  <input type="hidden" name="next" value={next ?? "/"} />
                  <input type="hidden" name="remember" value="on" />
                  <Button type="submit" variant="primary" size="lg">
                    <Icon />
                    {label}
                  </Button>
                </form>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

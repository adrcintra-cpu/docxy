"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { REMEMBER_COOKIE } from "@/lib/supabase/cookies";
import { publicEnv, enabledProviders, type OAuthProvider } from "@/lib/env";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

export type FormState = { error?: string; message?: string; fields?: Record<string, string> } | undefined;

/** Aceita apenas caminhos internos ("/x"), nunca "//evil.com" ou URLs absolutas. */
function safeNext(value: FormDataEntryValue | string | null | undefined): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

async function setRemember(remember: boolean) {
  (await cookies()).set(REMEMBER_COOKIE, remember ? "1" : "0", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

// ─── E-mail e senha ────────────────────────────────────────────────────

const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido."),
  password: z.string().min(1, "Informe sua senha."),
});

export async function signInWithPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signInSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  const email = String(formData.get("email") ?? "");
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message, fields: { email } };
  }

  await setRemember(formData.get("remember") === "on");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error || !data.user) {
    await audit({ event: "auth.sign_in", result: "FAILURE", metadata: { method: "password", reason: error?.code ?? "unknown" } });
    const unconfirmed = error?.code === "email_not_confirmed";
    return {
      error: unconfirmed ? "Confirme seu e-mail antes de entrar." : "E-mail ou senha incorretos.",
      fields: { email },
    };
  }

  await db.user.updateMany({ where: { id: data.user.id }, data: { lastSeenAt: new Date() } });
  await audit({ event: "auth.sign_in", result: "SUCCESS", userId: data.user.id, metadata: { method: "password" } });
  redirect(safeNext(formData.get("next")));
}

// ─── OAuth (Microsoft, Google, Apple) ──────────────────────────────────

export async function signInWithProvider(formData: FormData) {
  const provider = String(formData.get("provider")) as OAuthProvider;
  if (!enabledProviders.includes(provider)) {
    redirect("/login?error=provider");
  }
  await setRemember(formData.get("remember") === "on");

  const supabase = await createClient();
  const callback = new URL("/auth/callback", publicEnv.NEXT_PUBLIC_SITE_URL);
  callback.searchParams.set("next", safeNext(formData.get("next")));
  callback.searchParams.set("method", provider);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: callback.toString(),
      scopes: provider === "azure" ? "email openid profile" : undefined,
    },
  });
  if (error || !data.url) {
    await audit({ event: "auth.sign_in", result: "FAILURE", metadata: { method: provider, reason: error?.code ?? "no_url" } });
    redirect("/login?error=oauth");
  }
  redirect(data.url);
}

// ─── Recuperação de senha ──────────────────────────────────────────────

export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = z.string().trim().toLowerCase().email().safeParse(formData.get("email"));
  if (!parsed.success) return { error: "Informe um e-mail válido." };

  const supabase = await createClient();
  const redirectTo = new URL("/auth/callback?next=/redefinir-senha", publicEnv.NEXT_PUBLIC_SITE_URL).toString();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, { redirectTo });
  await audit({ event: "auth.password_reset_requested", result: error ? "FAILURE" : "SUCCESS", metadata: { reason: error?.code } });

  // Mesma resposta exista ou não a conta (não revela e-mails cadastrados).
  return { message: "Se houver uma conta com esse e-mail, você receberá um link para criar uma nova senha." };
}

const passwordSchema = z
  .object({
    password: z
      .string()
      .min(10, "A senha precisa ter pelo menos 10 caracteres.")
      .regex(/[A-Za-z]/, "Use pelo menos uma letra.")
      .regex(/\d/, "Use pelo menos um número."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "As senhas não conferem.", path: ["confirm"] });

export async function updatePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = passwordSchema.safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "O link expirou. Solicite a recuperação de senha novamente." };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  await audit({ event: "auth.password_updated", result: error ? "FAILURE" : "SUCCESS", userId: user.id, metadata: { reason: error?.code } });
  if (error) {
    return {
      error: error.code === "same_password" ? "Escolha uma senha diferente da atual." : "Não foi possível salvar a nova senha.",
    };
  }
  redirect("/?senha=atualizada");
}

// ─── Logout ────────────────────────────────────────────────────────────

export async function signOut() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  await supabase.auth.signOut();
  await audit({ event: "auth.sign_out", result: "SUCCESS", userId: user?.id });
  redirect("/login");
}

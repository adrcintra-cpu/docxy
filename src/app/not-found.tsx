import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
      <Logo className="h-10" />
      <h1 className="text-title font-semibold">Página não encontrada</h1>
      <p className="text-body-sm text-ink-muted">O endereço não existe ou você não tem acesso a ele.</p>
      <Link href="/" className="text-body text-accent-strong hover:underline">
        Voltar ao início
      </Link>
    </main>
  );
}

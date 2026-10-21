import { Logo } from "@/components/brand/logo";
import { ParticleSphere } from "./particle-sphere";

/** Layout das telas de autenticação: esfera à esquerda, painel à direita (referência 01). */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative grid min-h-dvh overflow-hidden bg-login lg:grid-cols-[1fr_minmax(420px,560px)]">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(ellipse at 35% 50%, #17213a 0%, #111722 60%)" }}
        aria-hidden
      />
      <ParticleSphere className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[min(90vh,130vw)] -translate-x-1/2 -translate-y-1/2 opacity-40 lg:relative lg:left-auto lg:top-auto lg:w-auto lg:translate-x-0 lg:translate-y-0 lg:self-center lg:opacity-100 lg:h-[min(88vh,960px)]" />
      <section className="relative z-10 flex items-center justify-center p-4 sm:p-8 lg:pr-16">
        <div className="w-full max-w-[440px] rounded-[32px] border border-white/10 bg-login-panel/85 px-6 py-12 shadow-[0_24px_80px_-20px_rgba(0,0,0,.6)] backdrop-blur-md sm:px-10 sm:py-16">
          <div className="mb-12 flex justify-center">
            <Logo className="h-12" />
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}

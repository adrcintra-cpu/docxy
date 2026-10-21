/** Recria a cada navegação: aplica a animação de entrada em cada tela. */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-enter flex flex-1 flex-col gap-4 sm:gap-6">{children}</div>;
}

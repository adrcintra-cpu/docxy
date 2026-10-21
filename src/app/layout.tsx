import type { Metadata, Viewport } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";

// Substituto aberto da Gotham vista nas referências (trocar quando a fonte oficial for definida).
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-montserrat",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Docxy", template: "%s · Docxy" },
  description: "Gestão, comparação e extração inteligente de documentos.",
  icons: { icon: "/docxy-mark.svg" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#1f232e",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={montserrat.variable}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}

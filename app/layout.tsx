import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";

import "@fontsource-variable/atkinson-hyperlegible-next";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";

import { SiteHeader } from "#/ui/site-header";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Pulso Público — projetos de lei sem juridiquês",
    template: "%s · Pulso Público",
  },
  description: "Acompanhe projetos e parlamentares da Câmara e do Senado com dados oficiais.",
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#087A59",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <a className="skipLink" href="#conteudo">Pular para o conteúdo</a>
        <SiteHeader />
        {children}
        <footer className="siteFooter">
          <p>Dados oficiais da Câmara dos Deputados e do Senado Federal.</p>
          <p>Informação pública em linguagem clara, sem avaliação política.</p>
        </footer>
      </body>
    </html>
  );
}

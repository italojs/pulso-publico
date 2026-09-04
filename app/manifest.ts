import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pulso Público",
    short_name: "Pulso",
    description: "Projetos de lei da Câmara e do Senado em linguagem clara.",
    start_url: "/",
    display: "standalone",
    background_color: "#F3F6F5",
    theme_color: "#087A59",
    lang: "pt-BR",
  };
}

"use client";

export default function ErrorPage({ reset }: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  return <main id="conteudo" className="centeredState"><span className="eyebrow">Não foi possível atualizar a tela</span><h1>Os últimos dados confirmados continuam seguros.</h1><p>Tente carregar novamente. Se uma fonte oficial estiver fora do ar, voltaremos a consultar automaticamente.</p><button type="button" onClick={reset}>Tentar novamente</button></main>;
}

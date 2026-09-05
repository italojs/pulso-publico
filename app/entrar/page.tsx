function errorMessage(error: string | string[] | undefined) {
  return error === "credenciais" ? "E-mail ou senha incorretos. Tente novamente." : null;
}

export default async function LoginPage({ searchParams }: Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  const params = await searchParams;
  const message = errorMessage(params.erro);
  const next = typeof params.next === "string" && params.next.startsWith("/") && !params.next.startsWith("//") ? params.next : "/seguindo";
  return (
    <main id="conteudo" className="authPage">
      <section className="authCard"><span className="eyebrow">Seu acompanhamento</span><h1>Entre para seguir e receber alertas.</h1><p>Consultar as informações continua livre. A conta é necessária para salvar projetos, parlamentares e candidaturas e acompanhar as mudanças ao longo do tempo.</p>{message ? <p className="formError" role="alert">{message}</p> : null}<form action="/api/auth/login" method="post"><input name="next" type="hidden" value={next} /><label>E-mail<input autoComplete="email" name="email" required type="email" /></label><label>Senha<input autoComplete="current-password" minLength={10} name="password" required type="password" /></label><button type="submit">Entrar</button></form><p className="authSwitch">Ainda não tem conta? <a href={`/cadastro?next=${encodeURIComponent(next)}`}>Criar conta</a></p></section>
      <aside className="authAside"><strong>Seus dados, seu controle.</strong><ul><li>Senha protegida com derivação segura.</li><li>Sessão em cookie que o JavaScript não lê.</li><li>Sem cadastro obrigatório para consultar política.</li></ul></aside>
    </main>
  );
}

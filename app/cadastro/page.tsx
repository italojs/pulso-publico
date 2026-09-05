function errorMessage(error: string | string[] | undefined) {
  if (error === "email") return "Este e-mail já está cadastrado. Você pode entrar na sua conta.";
  if (error === "dados") return "Confira o e-mail e use uma senha com pelo menos 10 caracteres.";
  return null;
}

export default async function RegistrationPage({ searchParams }: Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  const params = await searchParams;
  const message = errorMessage(params.erro);
  const next = typeof params.next === "string" && params.next.startsWith("/") && !params.next.startsWith("//") ? params.next : "/seguindo";
  return (
    <main id="conteudo" className="authPage">
      <section className="authCard"><span className="eyebrow">Acompanhe do seu jeito</span><h1>Crie sua conta.</h1><p>O cadastro salva os projetos, parlamentares e candidaturas que você segue e libera a caixa de alertas.</p>{message ? <p className="formError" role="alert">{message}</p> : null}<form action="/api/auth/register" method="post"><input name="next" type="hidden" value={next} /><label>E-mail<input autoComplete="email" name="email" required type="email" /></label><label>Senha <small>mínimo de 10 caracteres</small><input autoComplete="new-password" minLength={10} name="password" required type="password" /></label><button type="submit">Criar conta e continuar</button></form><p className="authSwitch">Já tem conta? <a href={`/entrar?next=${encodeURIComponent(next)}`}>Entrar</a></p></section>
      <aside className="authAside"><strong>O que muda com a conta?</strong><ul><li>Itens seguidos ficam sincronizados.</li><li>Alertas aparecem quando uma etapa importante muda.</li><li>Nenhum ranking ou recomendação política é criado.</li></ul></aside>
    </main>
  );
}

import { BellIcon, BookmarkIcon, UserIcon } from "#/ui/icons";

export function SiteHeader() {
  return (
    <header className="siteHeader">
      <div className="siteHeader__inner">
        <a className="brand" href="/" aria-label="Pulso Público">
          <span className="brand__mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="brand__text">
            <strong>Pulso</strong> Público
          </span>
        </a>
        <nav aria-label="Navegação principal" className="siteNav">
          <a href="/">Projetos</a>
          <a href="/candidatos">Candidatos</a>
          <a href="/seguindo">
            <BookmarkIcon />
            <span>Seguindo</span>
          </a>
          <a href="/alertas">
            <BellIcon />
            <span>Alertas</span>
          </a>
          <a className="siteNav__account" href="/entrar">
            <UserIcon />
            <span>Entrar</span>
          </a>
        </nav>
      </div>
    </header>
  );
}

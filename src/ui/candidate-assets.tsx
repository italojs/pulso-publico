import type { PublicCandidateAsset } from "#/server/candidates/read-models";
import { formatCandidateMoney } from "#/ui/candidate-finance";

export function CandidateAssets({
  assets,
  categories,
  totalCents,
}: Readonly<{
  assets: PublicCandidateAsset[];
  categories: Array<{ category: string; valueCents: string; count: number }>;
  totalCents: string | null;
}>) {
  return (
    <section className="candidateDossier__section" aria-labelledby="candidate-assets-title">
      <header className="candidateDossier__sectionHeader">
        <span className="eyebrow">Informado à Justiça Eleitoral</span>
        <h2 id="candidate-assets-title">Patrimônio declarado</h2>
      </header>
      {totalCents === null || assets.length === 0 ? (
        <p className="sectionEmpty">Ainda não disponibilizado pelo TSE.</p>
      ) : (
        <>
          <p className="candidateDossier__lead">
            Total declarado: <strong>{formatCandidateMoney(totalCents)}</strong> em {assets.length.toLocaleString("pt-BR")} {assets.length === 1 ? "registro" : "registros"}.
          </p>
          <div className="candidateEvidenceTable tableScroll">
            <table aria-label="Distribuição dos bens por categoria">
              <thead><tr><th scope="col">Categoria</th><th scope="col">Quantidade</th><th scope="col">Valor</th></tr></thead>
              <tbody>{categories.map((category) => (
                <tr key={category.category}>
                  <th scope="row">{category.category}</th>
                  <td>{category.count.toLocaleString("pt-BR")}</td>
                  <td>{formatCandidateMoney(category.valueCents)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="candidateEvidenceTable tableScroll">
            <table aria-label="Bens declarados ao TSE">
              <thead><tr><th scope="col">Categoria</th><th scope="col">Descrição oficial</th><th scope="col">Valor</th></tr></thead>
              <tbody>{assets.map((asset, index) => (
                <tr key={`${asset.category}-${asset.description ?? ""}-${asset.valueCents}-${index}`}>
                  <th scope="row">{asset.category}</th>
                  <td>{asset.description ?? "Descrição não informada"}</td>
                  <td>{formatCandidateMoney(asset.valueCents)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

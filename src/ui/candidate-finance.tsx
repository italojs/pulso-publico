import type { PublicCandidateFinance } from "#/server/candidates/read-models";
import { formatDateTime } from "#/ui/format";

const integer = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

export function formatCandidateMoney(value: string | null): string | null {
  if (value === null || !/^-?\d+$/.test(value)) return null;
  const cents = BigInt(value);
  const absolute = cents < 0n ? -cents : cents;
  return `${cents < 0n ? "-" : ""}R$ ${integer.format(absolute / 100n)},${(absolute % 100n).toString().padStart(2, "0")}`;
}

function CategoryTable({
  caption,
  values,
}: Readonly<{ caption: string; values: Record<string, string> }>) {
  const entries = Object.entries(values).toSorted(([left], [right]) => left.localeCompare(right, "pt-BR"));
  const amounts = entries.map(([, value]) => /^\d+$/.test(value) ? BigInt(value) : 0n);
  const maximum = amounts.reduce((largest, value) => value > largest ? value : largest, 0n);
  return (
    <div className="candidateEvidenceTable">
      <div aria-hidden="true" className="candidateBars">
        {entries.map(([label], index) => <span key={label} style={{
          "--candidate-bar": `${maximum === 0n ? 0 : Number((amounts[index]! * 100n) / maximum)}%`,
        } as React.CSSProperties} />)}
      </div>
      <div className="tableScroll">
        <table aria-label={caption}>
          <thead><tr><th scope="col">Categoria</th><th scope="col">Valor</th></tr></thead>
          <tbody>{entries.length ? entries.map(([label, value]) => (
            <tr key={label}><th scope="row">{label}</th><td>{formatCandidateMoney(value) ?? "Não informado pela fonte"}</td></tr>
          )) : <tr><td colSpan={2}>Composição não informada pela fonte.</td></tr>}</tbody>
        </table>
      </div>
    </div>
  );
}

export function CandidateFinance({ finance }: Readonly<{ finance: PublicCandidateFinance | null }>) {
  return (
    <section className="candidateDossier__section" aria-labelledby="candidate-finance-title">
      <header className="candidateDossier__sectionHeader">
        <span className="eyebrow">Prestação de contas eleitoral</span>
        <h2 id="candidate-finance-title">Financiamento de campanha</h2>
      </header>
      {!finance ? <p className="sectionEmpty">Ainda não disponibilizado pelo TSE.</p> : (
        <>
          <dl className="candidateMetricGrid">
            <div><dt>Receita</dt><dd>{formatCandidateMoney(finance.revenueCents) ?? "Não informado pela fonte"}</dd></div>
            <div><dt>Despesa contratada</dt><dd>{formatCandidateMoney(finance.expenseCents) ?? "Não informado pela fonte"}</dd></div>
            <div><dt>Saldo calculado</dt><dd>{formatCandidateMoney(finance.balanceCents) ?? "Não informado pela fonte"}</dd></div>
          </dl>
          <div className="candidateFinance__tables">
            <CategoryTable caption="Composição da receita" values={finance.revenueByCategory} />
            <CategoryTable caption="Categorias de despesas" values={finance.expenseByCategory} />
          </div>
          <p className="candidateSourceNote">
            Fonte: prestação de contas do TSE · conferida em {formatDateTime(finance.checkedAt)}.
          </p>
        </>
      )}
    </section>
  );
}

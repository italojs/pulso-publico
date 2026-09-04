import type { PublicLawmakerVote } from "#/server/public/read-models";
import { formatDate } from "#/ui/format";
import { ExternalIcon } from "#/ui/icons";

export function LawmakerVoteCard({ vote }: Readonly<{ vote: PublicLawmakerVote }>) {
  return (
    <article className="lawmakerVote">
      <div><span className="eyebrow">{vote.officialCode} · {formatDate(vote.occurredAt)}</span><h3><a href={`/projetos/${vote.billSource}/${vote.billExternalId}`}>{vote.officialTitle}</a></h3><p>{vote.description}</p></div>
      <dl><div><dt>Como votou</dt><dd>{vote.rawChoice}</dd></div><div><dt>Resultado</dt><dd>{vote.result ?? "Não informado"}</dd></div></dl>
      <a className="officialLink" href={vote.officialUrl} rel="noreferrer" target="_blank">Fonte oficial <ExternalIcon /></a>
    </article>
  );
}

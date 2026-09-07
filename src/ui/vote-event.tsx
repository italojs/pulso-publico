import type { PublicVoteEvent } from "#/server/public/read-models";
import { formatDateTime, houseLabel } from "#/ui/format";
import { ExternalIcon } from "#/ui/icons";

const choiceLabels: Record<PublicVoteEvent["individualVotes"][number]["choice"], string> = {
  sim: "Sim",
  nao: "Não",
  abstencao: "Abstenção",
  obstrucao: "Obstrução",
  outro: "Outro",
  indisponivel: "Não informado",
};

export function voteEventAnchorId(event: Pick<PublicVoteEvent, "house" | "externalId">) {
  const safeExternalId = event.externalId.replace(/[^a-zA-Z0-9_-]+/g, "-");
  return `votacao-${event.house}-${safeExternalId}`;
}

export function VoteEventCard({ event }: Readonly<{ event: PublicVoteEvent }>) {
  return (
    <article className="voteEvent" id={voteEventAnchorId(event)}>
      <header>
        <div><span className="eyebrow">{houseLabel(event.house)} · dado oficial</span><h3>{event.description}</h3></div>
        <div className="voteEvent__result"><span>Resultado</span><strong>{event.result ?? "Não informado"}</strong></div>
      </header>
      <p className="voteEvent__date"><time dateTime={event.occurredAt}>{formatDateTime(event.occurredAt)}</time></p>
      {event.isSecret ? (
        <p className="dataNotice">Esta votação foi secreta. A fonte oficial não divulga votos individuais.</p>
      ) : !event.isNominal ? (
        <p className="dataNotice">A votação não foi nominal; não há votos individuais para exibir.</p>
      ) : event.individualVotes.length === 0 ? (
        <p className="dataNotice">Os votos individuais não estão disponíveis na fonte consultada.</p>
      ) : (
        <details className="voteList">
          <summary>Ver {event.individualVotes.length.toLocaleString("pt-BR")} votos individuais</summary>
          <div className="tableScroll">
            <table aria-label="Votos individuais">
              <thead><tr><th>Parlamentar</th><th>Partido / UF</th><th>Voto oficial</th></tr></thead>
              <tbody>{event.individualVotes.map((vote) => (
                <tr key={vote.lawmakerExternalId}>
                  <td><a href={`/parlamentares/${event.house === "senado" ? "senado" : "camara"}/${vote.lawmakerExternalId}`}>{vote.lawmakerName}</a></td>
                  <td>{[vote.party, vote.region].filter(Boolean).join(" · ") || "Não informado"}</td>
                  <td><span className={`voteChoice voteChoice--${vote.choice}`}>{vote.rawChoice || choiceLabels[vote.choice]}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </details>
      )}
      <a className="officialLink" href={event.officialUrl} rel="noreferrer" target="_blank">Conferir votação na fonte <ExternalIcon /></a>
    </article>
  );
}

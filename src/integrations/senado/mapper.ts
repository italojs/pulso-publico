import { z } from "zod";

import {
  BillAuthorRecord,
  BillRecord,
  BillTopicRecord,
  IndividualVoteRecord,
  LawmakerRecord,
  MovementRecord,
  VoteEventRecord,
  type Bill,
  type BillAuthor,
  type BillTopic,
  type IndividualVote,
  type Lawmaker,
  type Movement,
  type VoteEvent,
} from "#/domain/legislative";

const identifier = z.union([z.string(), z.number()]).transform(String);
const optionalIdentifier = z.union([z.string(), z.number()]).nullish();

const contentSchema = z.object({
  ementa: z.string().nullish(),
}).nullish();

const documentSchema = z.object({
  dataApresentacao: z.string().nullish(),
}).nullish();

const rawProcessSchema = z.object({
  id: identifier,
  codigoMateria: identifier,
  identificacao: z.string().min(1),
  sigla: z.string().nullish(),
  descricaoSigla: z.string().nullish(),
  numero: optionalIdentifier,
  ano: z.union([z.string(), z.number()]).transform(Number).nullish(),
  objetivo: z.string().nullish(),
  casaIdentificadora: z.string().nullish(),
  siglaCasaIniciadora: z.string().nullish(),
  ementa: z.string().nullish(),
  conteudo: contentSchema,
  documento: documentSchema,
  dataApresentacao: z.string().nullish(),
  dataInicioEfetivo: z.string().nullish(),
  situacaoAtual: z.string().nullish(),
  siglaSituacaoAtual: z.string().nullish(),
});

const rawCatalogAuthorSchema = z.object({
  autoria: z.string().nullish(),
});

const rawAuthorSchema = z.object({
  autor: z.string().min(1),
  siglaTipo: z.string().min(1),
  descricaoTipo: z.string().nullish(),
  ordem: z.number().int().nonnegative().nullish(),
  codigoParlamentar: optionalIdentifier,
  siglaPartido: z.string().nullish(),
  idEnte: optionalIdentifier,
});

const rawTopicSchema = z.object({
  codigo: identifier,
  descricao: z.string().min(1),
  descricaoHierarquia: z.string().nullish(),
});

const bodySchema = z.object({
  codigo: optionalIdentifier,
  id: optionalIdentifier,
  casa: z.string().nullish(),
  sigla: z.string().nullish(),
  nome: z.string().nullish(),
}).nullish();

const rawMovementSchema = z.object({
  id: identifier,
  data: z.string().min(1),
  descricao: z.string().min(1),
  colegiado: bodySchema,
  enteAdministrativo: bodySchema,
  idSituacaoIniciada: optionalIdentifier,
  siglaSituacaoIniciada: z.string().nullish(),
});

const rawVoteSchema = z.object({
  codigoMateria: identifier,
  codigoSessaoVotacao: identifier,
  dataSessao: z.string().min(1),
  descricaoVotacao: z.string().min(1),
  idProcesso: identifier,
  resultadoVotacao: z.string().nullish(),
  votacaoSecreta: z.string().nullish(),
  votos: z.array(z.unknown()).nullish(),
});

const rawIndividualVoteSchema = z.object({
  codigoParlamentar: identifier,
  siglaVotoParlamentar: z.string().min(1),
});

const identificationSchema = z.object({
  CodigoParlamentar: identifier,
  NomeParlamentar: z.string().min(1),
  NomeCompletoParlamentar: z.string().min(1),
  UrlFotoParlamentar: z.string().url().nullish(),
  UrlPaginaParlamentar: z.string().url().nullish(),
  SiglaPartidoParlamentar: z.string().nullish(),
  UfParlamentar: z.string().length(2).nullish(),
});

const rawLawmakerSchema = z.object({
  IdentificacaoParlamentar: identificationSchema,
});

const rawLawmakerDetailSchema = z.object({
  DetalheParlamentar: z.object({
    Parlamentar: rawLawmakerSchema,
  }),
});

function checkedAtIso(checkedAt: Date) {
  return checkedAt.toISOString();
}

function blankToNull(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function identifierOrNull(value: string | number | null | undefined) {
  return value === null || value === undefined ? null : String(value);
}

function localDateTimeToIso(value: string) {
  const normalized = value.trim().replace(" ", "T");
  const dateTime = normalized.includes("T") ? normalized : `${normalized}T00:00`;
  return Temporal.PlainDateTime.from(dateTime)
    .toZonedDateTime("America/Sao_Paulo")
    .toInstant()
    .toString({ smallestUnit: "millisecond" });
}

function stableName(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function secureUrl(value: string | null | undefined) {
  const url = blankToNull(value);
  return url?.replace(/^http:/, "https:") ?? null;
}

function processIdentity(value: z.infer<typeof rawProcessSchema>) {
  const match = value.identificacao.match(
    /^([^\s]+)\s+(\d+[A-Z]*)\/(\d{4})(?:\s+.+)?$/iu,
  );
  const sigla = blankToNull(value.sigla) ?? match?.[1] ?? null;
  // The public identification is authoritative because Senate records can expose
  // a numeric `numero` while retaining a meaningful alphabetic suffix (for
  // example, "RQS 11A/2019"). Dropping it would collide with RQS 11/2019.
  const officialNumber = match?.[2] ?? identifierOrNull(value.numero) ?? null;
  const ano = value.ano ?? (match?.[3] ? Number(match[3]) : null);
  const numericNumber = officialNumber?.match(/^\d+/u)?.[0];
  if (!sigla || !officialNumber || !numericNumber || !ano) {
    throw new Error(`Senado process ${value.id} has an invalid official identification`);
  }
  const displayNumber = /^\d+$/u.test(officialNumber)
    ? String(Number(officialNumber))
    : officialNumber.toUpperCase();
  return {
    sigla,
    displayNumber,
    proposalNumber: Number(numericNumber),
    identityNumber: displayNumber.toLowerCase(),
    ano,
  };
}

function officialBillUrl(codigoMateria: string) {
  return `https://www25.senado.leg.br/web/atividade/materias/-/materia/${codigoMateria}`;
}

function inferOriginHouse(value: z.infer<typeof rawProcessSchema>) {
  if (value.siglaCasaIniciadora === "CD") return "camara" as const;
  if (value.siglaCasaIniciadora === "CN") return "congresso" as const;
  if (value.siglaCasaIniciadora === "SF") return "senado" as const;
  if (value.objetivo?.toLowerCase() === "revisora") return "camara" as const;
  return "senado" as const;
}

function inferCurrentHouse(value: z.infer<typeof rawProcessSchema>, status: string) {
  const normalized = status.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  if (normalized.includes("camara dos deputados")) return "camara" as const;
  if (value.casaIdentificadora === "CN" || normalized.includes("congresso nacional")) {
    return "congresso" as const;
  }
  return "senado" as const;
}

function normalizeVoteChoice(rawChoice: string) {
  const normalized = rawChoice
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
  if (normalized === "sim") return "sim" as const;
  if (normalized === "nao") return "nao" as const;
  if (normalized.startsWith("abstenc")) return "abstencao" as const;
  if (normalized.startsWith("obstruc")) return "obstrucao" as const;
  if (["ls", "lp", "p-nrv", "ausente"].includes(normalized)) return "indisponivel" as const;
  return "outro" as const;
}

export function mapSenadoBill(raw: unknown, checkedAt: Date): Bill {
  const value = rawProcessSchema.parse(raw);
  const identity = processIdentity(value);
  const statusLabel = blankToNull(value.situacaoAtual) ?? "Situação não informada";
  const ementa = blankToNull(value.ementa) ?? blankToNull(value.conteudo?.ementa) ?? "";
  const presentedAt = value.dataApresentacao
    ?? value.documento?.dataApresentacao
    ?? value.dataInicioEfetivo;

  return BillRecord.parse({
    source: "senado",
    externalId: value.id,
    officialCode: `${identity.sigla.toUpperCase()} ${identity.displayNumber}/${identity.ano}`,
    proposalType: identity.sigla,
    proposalNumber: identity.proposalNumber,
    proposalYear: identity.ano,
    congressionalKey: `${identity.sigla.toLowerCase()}:${identity.identityNumber}:${identity.ano}`,
    officialTitle: value.identificacao,
    officialSummary: ementa,
    originHouse: inferOriginHouse(value),
    currentHouse: inferCurrentHouse(value, statusLabel),
    statusCode: blankToNull(value.siglaSituacaoAtual),
    statusLabel,
    officialUrl: officialBillUrl(value.codigoMateria),
    presentedAt: presentedAt ? localDateTimeToIso(presentedAt) : null,
    checkedAt: checkedAtIso(checkedAt),
  });
}

export function mapSenadoAuthor(
  raw: unknown,
  billId: string,
  checkedAt: Date,
): BillAuthor {
  const value = rawAuthorSchema.parse(raw);
  const order = value.ordem ?? 0;
  const lawmakerExternalId = identifierOrNull(value.codigoParlamentar);
  const identity = lawmakerExternalId
    ?? identifierOrNull(value.idEnte)
    ?? stableName(value.autor);

  return BillAuthorRecord.parse({
    source: "senado",
    externalId: `${billId}:${order}:${identity}`,
    billExternalId: billId,
    lawmakerExternalId,
    officialName: value.autor,
    party: blankToNull(value.siglaPartido),
    authorKind: blankToNull(value.descricaoTipo) ?? value.siglaTipo,
    isPrimary: order === 1,
    officialUrl: lawmakerExternalId
      ? `https://www25.senado.leg.br/web/senadores/senador/-/perfil/${lawmakerExternalId}`
      : `https://legis.senado.leg.br/atividade/materias/-/materia/${billId}`,
    checkedAt: checkedAtIso(checkedAt),
  });
}

export function mapSenadoCatalogAuthor(
  raw: unknown,
  billId: string,
  checkedAt: Date,
): BillAuthor | null {
  const value = rawCatalogAuthorSchema.parse(raw);
  const name = blankToNull(value.autoria);
  if (!name) return null;
  return mapSenadoAuthor({
    autor: name,
    siglaTipo: "AUTORIA",
    descricaoTipo: "Autoria informada pelo Senado",
    ordem: 1,
  }, billId, checkedAt);
}

export function mapSenadoTopic(
  raw: unknown,
  billId: string,
  checkedAt: Date,
): BillTopic {
  const value = rawTopicSchema.parse(raw);
  return BillTopicRecord.parse({
    source: "senado",
    externalId: `${billId}:${value.codigo}`,
    billExternalId: billId,
    code: value.codigo,
    label: value.descricao,
    officialUrl: `https://legis.senado.leg.br/dadosabertos/processo/${billId}`,
    checkedAt: checkedAtIso(checkedAt),
  });
}

export function mapSenadoMovement(
  raw: unknown,
  billId: string,
  sequence: number,
  checkedAt: Date,
): Movement {
  const value = rawMovementSchema.parse(raw);
  const body = value.colegiado ?? value.enteAdministrativo;

  return MovementRecord.parse({
    source: "senado",
    externalId: `${billId}:${value.id}`,
    billExternalId: billId,
    occurredAt: localDateTimeToIso(value.data),
    sequence,
    house: body?.casa === "CN" ? "congresso" : "senado",
    bodyCode: blankToNull(body?.sigla),
    bodyName: blankToNull(body?.nome),
    statusCode: blankToNull(value.siglaSituacaoIniciada)
      ?? identifierOrNull(value.idSituacaoIniciada),
    statusLabel: null,
    officialDescription: value.descricao.trim(),
    officialUrl: `https://legis.senado.leg.br/dadosabertos/processo/${billId}`,
    checkedAt: checkedAtIso(checkedAt),
  });
}

export function mapSenadoVoteEvent(
  raw: unknown,
  billId: string,
  checkedAt: Date,
): VoteEvent {
  const value = rawVoteSchema.parse(raw);
  const secret = value.votacaoSecreta?.toUpperCase() === "S";
  const resultCode = blankToNull(value.resultadoVotacao)?.toUpperCase();
  const result = resultCode === "A"
    ? "aprovada"
    : resultCode === "R"
      ? "rejeitada"
      : blankToNull(value.resultadoVotacao);

  return VoteEventRecord.parse({
    source: "senado",
    externalId: `${value.idProcesso}:${value.codigoSessaoVotacao}`,
    billExternalId: billId,
    occurredAt: localDateTimeToIso(value.dataSessao),
    house: "senado",
    description: value.descricaoVotacao,
    result,
    isNominal: !secret && (value.votos?.length ?? 0) > 0,
    isSecret: secret,
    officialUrl: officialBillUrl(value.codigoMateria),
    checkedAt: checkedAtIso(checkedAt),
  });
}

export function mapSenadoIndividualVote(
  raw: unknown,
  voteId: string,
  checkedAt: Date,
): IndividualVote {
  const value = rawIndividualVoteSchema.parse(raw);
  const processId = voteId.split(":", 1)[0];
  if (!processId) throw new Error("Senado vote id has no process id");

  return IndividualVoteRecord.parse({
    source: "senado",
    externalId: `${voteId}:${value.codigoParlamentar}`,
    voteEventExternalId: voteId,
    lawmakerExternalId: value.codigoParlamentar,
    choice: normalizeVoteChoice(value.siglaVotoParlamentar),
    rawChoice: value.siglaVotoParlamentar,
    officialUrl: `https://legis.senado.leg.br/dadosabertos/votacao?idProcesso=${processId}`,
    checkedAt: checkedAtIso(checkedAt),
  });
}

export function mapSenadoLawmaker(
  raw: unknown,
  checkedAt: Date,
  active = true,
): Lawmaker {
  const value = rawLawmakerSchema.parse(raw).IdentificacaoParlamentar;
  return LawmakerRecord.parse({
    source: "senado",
    externalId: value.CodigoParlamentar,
    name: value.NomeCompletoParlamentar,
    electoralName: value.NomeParlamentar,
    role: "senador",
    party: blankToNull(value.SiglaPartidoParlamentar),
    region: blankToNull(value.UfParlamentar),
    photoUrl: secureUrl(value.UrlFotoParlamentar),
    active,
    officialUrl: secureUrl(value.UrlPaginaParlamentar)
      ?? `https://www25.senado.leg.br/web/senadores/senador/-/perfil/${value.CodigoParlamentar}`,
    checkedAt: checkedAtIso(checkedAt),
  });
}

export function mapSenadoLawmakerDetail(
  raw: unknown,
  checkedAt: Date,
): Lawmaker {
  const value = rawLawmakerDetailSchema.parse(raw);
  return mapSenadoLawmaker(value.DetalheParlamentar.Parlamentar, checkedAt, false);
}

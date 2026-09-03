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
  type VoteChoice,
  type VoteEvent,
} from "#/domain/legislative";

const identifier = z.union([z.string(), z.number()]).transform(String);
const optionalIdentifier = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((value) => (value === null || value === undefined ? null : String(value)));

const rawStatusSchema = z.object({
  dataHora: z.string().nullish(),
  sequencia: z.number().int().nullish(),
  siglaOrgao: z.string().nullish(),
  uriOrgao: z.string().nullish(),
  descricaoTramitacao: z.string().nullish(),
  codTipoTramitacao: optionalIdentifier,
  descricaoSituacao: z.string().nullish(),
  codSituacao: optionalIdentifier,
  despacho: z.string().nullish(),
  url: z.string().nullish(),
});

const rawBillSchema = z.object({
  id: identifier,
  uri: z.string().url(),
  siglaTipo: z.string().min(1),
  numero: identifier,
  ano: z.union([z.string(), z.number()]).transform(Number),
  ementa: z.string().default(""),
  dataApresentacao: z.string().nullish(),
  descricaoTipo: z.string().nullish(),
  statusProposicao: rawStatusSchema.nullish(),
});

const rawAuthorSchema = z.object({
  uri: z.string().url().nullish(),
  nome: z.string().min(1),
  codTipo: optionalIdentifier,
  tipo: z.string().min(1),
  ordemAssinatura: z.number().int().nonnegative().nullish(),
  proponente: z.union([z.number(), z.boolean()]).nullish(),
});

const rawTopicSchema = z.object({
  codTema: optionalIdentifier,
  tema: z.string().min(1),
});

const rawMovementSchema = rawStatusSchema.extend({
  dataHora: z.string().min(1),
  sequencia: z.number().int().nonnegative(),
  descricaoTramitacao: z.string().min(1),
});

const rawVoteEventSchema = z.object({
  id: identifier,
  uri: z.string().url(),
  data: z.string().nullish(),
  dataHoraRegistro: z.string().nullish(),
  siglaOrgao: z.string().nullish(),
  uriOrgao: z.string().nullish(),
  descricao: z.string().min(1),
  aprovacao: z.union([z.literal(0), z.literal(1), z.null()]).optional(),
});

const rawDeputySchema = z.object({
  id: identifier,
  uri: z.string().url(),
  nome: z.string().min(1),
  siglaPartido: z.string().nullish(),
  siglaUf: z.string().length(2).nullish(),
  urlFoto: z.string().url().nullish(),
});

const rawIndividualVoteSchema = z.object({
  tipoVoto: z.string().min(1),
  dataRegistroVoto: z.string().nullish(),
  deputado_: rawDeputySchema,
});

function checkedAtIso(checkedAt: Date) {
  return checkedAt.toISOString();
}

function localDateTimeToIso(value: string) {
  const dateTime = value.includes("T") ? value : `${value}T00:00`;
  return Temporal.PlainDateTime.from(dateTime)
    .toZonedDateTime("America/Sao_Paulo")
    .toInstant()
    .toString({ smallestUnit: "millisecond" });
}

function officialBillUrl(id: string) {
  return `https://www.camara.leg.br/propostas-legislativas/${id}`;
}

function blankToNull(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function extractDeputyId(uri: string | null | undefined) {
  return uri?.match(/\/deputados\/(\d+)(?:$|[/?#])/)?.[1] ?? null;
}

function stableName(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function inferCurrentHouse(statusLabel: string) {
  const normalized = statusLabel.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  if (normalized.includes("senado")) {
    return "senado" as const;
  }
  if (normalized.includes("congresso")) {
    return "congresso" as const;
  }
  return "camara" as const;
}

function normalizeVoteChoice(rawChoice: string): z.infer<typeof VoteChoice> {
  const normalized = rawChoice
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();

  if (normalized === "sim") return "sim";
  if (normalized === "nao") return "nao";
  if (normalized.startsWith("abstenc")) return "abstencao";
  if (normalized.startsWith("obstruc")) return "obstrucao";
  if (normalized === "nao votou" || normalized === "ausente") return "indisponivel";
  return "outro";
}

export function mapCamaraBill(raw: unknown, checkedAt: Date): Bill {
  const value = rawBillSchema.parse(raw);
  const statusLabel = blankToNull(value.statusProposicao?.descricaoSituacao)
    ?? "Situação não informada";
  const officialCode = `${value.siglaTipo.toUpperCase()} ${value.numero}/${value.ano}`;
  const officialType = blankToNull(value.descricaoTipo) ?? value.siglaTipo.toUpperCase();

  return BillRecord.parse({
    source: "camara",
    externalId: value.id,
    officialCode,
    congressionalKey: `${value.siglaTipo.toLowerCase()}:${value.numero}:${value.ano}`,
    officialTitle: `${officialType} ${value.numero}/${value.ano}`,
    officialSummary: value.ementa,
    originHouse: "camara",
    currentHouse: inferCurrentHouse(statusLabel),
    statusCode: value.statusProposicao?.codSituacao ?? null,
    statusLabel,
    officialUrl: officialBillUrl(value.id),
    presentedAt: value.dataApresentacao
      ? localDateTimeToIso(value.dataApresentacao)
      : null,
    checkedAt: checkedAtIso(checkedAt),
  });
}

export function mapCamaraAuthor(
  raw: unknown,
  billId: string,
  checkedAt: Date,
): BillAuthor {
  const value = rawAuthorSchema.parse(raw);
  const lawmakerExternalId = extractDeputyId(value.uri);
  const order = value.ordemAssinatura ?? 0;
  const authorIdentity = lawmakerExternalId ?? stableName(value.nome);

  return BillAuthorRecord.parse({
    source: "camara",
    externalId: `${billId}:${order}:${authorIdentity}`,
    billExternalId: billId,
    lawmakerExternalId,
    officialName: value.nome,
    party: null,
    authorKind: value.tipo,
    isPrimary: value.proponente === true || value.proponente === 1 || order === 1,
    officialUrl: value.uri ?? `${officialBillUrl(billId)}/autores`,
    checkedAt: checkedAtIso(checkedAt),
  });
}

export function mapCamaraTopic(
  raw: unknown,
  billId: string,
  checkedAt: Date,
): BillTopic {
  const value = rawTopicSchema.parse(raw);
  const topicIdentity = value.codTema ?? stableName(value.tema);

  return BillTopicRecord.parse({
    source: "camara",
    externalId: `${billId}:${topicIdentity}`,
    billExternalId: billId,
    code: value.codTema,
    label: value.tema,
    officialUrl: `${officialBillUrl(billId)}/temas`,
    checkedAt: checkedAtIso(checkedAt),
  });
}

export function mapCamaraMovement(
  raw: unknown,
  billId: string,
  checkedAt: Date,
): Movement {
  const value = rawMovementSchema.parse(raw);
  const bodyCode = blankToNull(value.siglaOrgao);
  const externalId = [billId, value.sequencia, value.dataHora, bodyCode ?? "sem-orgao"].join(":");

  return MovementRecord.parse({
    source: "camara",
    externalId,
    billExternalId: billId,
    occurredAt: localDateTimeToIso(value.dataHora),
    sequence: value.sequencia,
    house: "camara",
    bodyCode,
    bodyName: bodyCode,
    statusCode: value.codSituacao,
    statusLabel: blankToNull(value.descricaoSituacao),
    officialDescription: blankToNull(value.despacho) ?? value.descricaoTramitacao,
    officialUrl: blankToNull(value.url) ?? `${officialBillUrl(billId)}/tramitacoes`,
    checkedAt: checkedAtIso(checkedAt),
  });
}

export function mapCamaraVoteEvent(
  raw: unknown,
  billId: string,
  checkedAt: Date,
): VoteEvent {
  const value = rawVoteEventSchema.parse(raw);
  const isSecret = /vota[cç][aã]o secreta|escrut[ií]nio secreto/iu.test(value.descricao);
  const hasNominalTally = /\bsim:\s*\d+[\s\S]*\bn[aã]o:\s*\d+/iu.test(value.descricao);
  const occurredAt = value.dataHoraRegistro ?? value.data;
  if (!occurredAt) {
    throw new Error(`Câmara vote ${value.id} has no official date`);
  }

  return VoteEventRecord.parse({
    source: "camara",
    externalId: value.id,
    billExternalId: billId,
    occurredAt: localDateTimeToIso(occurredAt),
    house: "camara",
    description: value.descricao,
    result: value.aprovacao === 1 ? "aprovada" : value.aprovacao === 0 ? "rejeitada" : null,
    isNominal: hasNominalTally && !isSecret,
    isSecret,
    officialUrl: value.uri,
    checkedAt: checkedAtIso(checkedAt),
  });
}

export function mapCamaraIndividualVote(
  raw: unknown,
  voteId: string,
  checkedAt: Date,
): IndividualVote {
  const value = rawIndividualVoteSchema.parse(raw);
  const lawmakerExternalId = value.deputado_.id;

  return IndividualVoteRecord.parse({
    source: "camara",
    externalId: `${voteId}:${lawmakerExternalId}`,
    voteEventExternalId: voteId,
    lawmakerExternalId,
    choice: normalizeVoteChoice(value.tipoVoto),
    rawChoice: value.tipoVoto,
    officialUrl: `https://dadosabertos.camara.leg.br/api/v2/votacoes/${encodeURIComponent(voteId)}/votos`,
    checkedAt: checkedAtIso(checkedAt),
  });
}

export function mapCamaraLawmaker(raw: unknown, checkedAt: Date): Lawmaker {
  const value = rawDeputySchema.parse(raw);

  return LawmakerRecord.parse({
    source: "camara",
    externalId: value.id,
    name: value.nome,
    electoralName: value.nome,
    role: "deputado_federal",
    party: blankToNull(value.siglaPartido),
    region: blankToNull(value.siglaUf),
    photoUrl: blankToNull(value.urlFoto),
    active: true,
    officialUrl: `https://www.camara.leg.br/deputados/${value.id}`,
    checkedAt: checkedAtIso(checkedAt),
  });
}

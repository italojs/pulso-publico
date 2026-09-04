import type { PublicBillFilters } from "#/server/public/read-models";

export type RawSearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function text(value: string | string[] | undefined) {
  const normalized = first(value)?.trim();
  return normalized ? normalized.slice(0, 200) : undefined;
}

export function parseFeedSearchParams(params: RawSearchParams): PublicBillFilters {
  const source = first(params.fonte);
  const order = first(params.ordem);
  const rawPage = Number.parseInt(first(params.pagina) ?? "1", 10);
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const filters: PublicBillFilters = { page, pageSize: 20 };

  const query = text(params.q);
  const status = text(params.situacao);
  const topic = text(params.tema);
  const party = text(params.partido);
  const author = text(params.autor);
  if (query) filters.query = query;
  if (source === "camara" || source === "senado") filters.source = source;
  if (status) filters.status = status;
  if (topic) filters.topic = topic;
  if (party) filters.party = party;
  if (author) filters.author = author;
  if (order === "updated" || order === "presented") filters.order = order;

  return filters;
}

export function buildFeedHref(filters: Partial<PublicBillFilters>, page: number) {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.source) params.set("fonte", filters.source);
  if (filters.status) params.set("situacao", filters.status);
  if (filters.topic) params.set("tema", filters.topic);
  if (filters.party) params.set("partido", filters.party);
  if (filters.author) params.set("autor", filters.author);
  if (filters.order) params.set("ordem", filters.order);
  if (page > 1) params.set("pagina", String(page));
  const query = params.toString();
  return query ? `/?${query}` : "/";
}

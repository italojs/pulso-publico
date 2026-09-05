export const TSE_DATA_ORIGIN = "https://cdn.tse.jus.br";

export const TSE_RESOURCE_PATHS = {
  candidates: "estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip",
  complements: "estatistica/sead/odsele/consulta_cand_complementar/consulta_cand_complementar_2026.zip",
  assets: "estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip",
  coalitions: "estatistica/sead/odsele/consulta_coligacao/consulta_coligacao_2026.zip",
  social: "estatistica/sead/odsele/consulta_cand/rede_social_candidato_2026.zip",
  campaignAccounts: "estatistica/sead/odsele/prestacao_contas/prestacao_de_contas_eleitorais_candidatos_2026.zip",
} as const;

export type TseResourceName = keyof typeof TSE_RESOURCE_PATHS;

export const TSE_REGIONS = [
  "BR",
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
  "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
  "SP", "SE", "TO",
] as const;

export type TseRegion = typeof TSE_REGIONS[number];

export const TSE_REGIONAL_MEDIA_PATHS = {
  photos: (region: TseRegion) => `estatistica/sead/eleicoes/eleicoes2026/fotos/foto_cand2026_${region}_div.zip`,
  governmentPlans: (region: TseRegion) => `estatistica/sead/odsele/proposta_governo/proposta_governo_2026_${region}.zip`,
  certificates: (region: TseRegion) => `estatistica/sead/odsele/certidao_criminal/certidao_criminal_2026_${region}.zip`,
} as const;

export type TseRegionalMediaKind = keyof typeof TSE_REGIONAL_MEDIA_PATHS;

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

export function isSafeOfficialTseUrl(value: string): boolean {
  const url = parseUrl(value);
  if (!url) return false;
  const hostname = url.hostname.toLocaleLowerCase("en-US");
  return url.protocol === "https:"
    && url.port === ""
    && url.username === ""
    && url.password === ""
    && (hostname === "tse.jus.br" || hostname.endsWith(".tse.jus.br"));
}

function isExactCdnArchiveUrl(value: string, path: string): boolean {
  const url = parseUrl(value);
  return url !== null
    && url.origin === TSE_DATA_ORIGIN
    && url.username === ""
    && url.password === ""
    && url.pathname === `/${path}`
    && url.search === ""
    && url.hash === "";
}

export function isCanonicalTseResourceArchiveUrl(
  resource: TseResourceName,
  value: string,
): boolean {
  return isExactCdnArchiveUrl(value, TSE_RESOURCE_PATHS[resource]);
}

export function isCanonicalTseMediaArchiveUrl(
  kind: TseRegionalMediaKind,
  value: string,
): boolean {
  return TSE_REGIONS.some((region) =>
    isExactCdnArchiveUrl(value, TSE_REGIONAL_MEDIA_PATHS[kind](region))
  );
}

export type CandidateGeoProvider = "none" | "cloudflare" | "vercel";

const BRAZILIAN_UFS = new Set([
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
]);

const providerHeader = {
  cloudflare: "cf-region-code",
  vercel: "x-vercel-ip-country-region",
} as const;

export function inferRegion(headers: Headers, provider: CandidateGeoProvider): string | undefined {
  if (provider === "none") return undefined;
  const region = headers.get(providerHeader[provider])?.trim().toUpperCase();
  return region && BRAZILIAN_UFS.has(region) ? region : undefined;
}

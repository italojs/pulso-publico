import { z } from "zod";
import { resolve } from "node:path";

const optionalSecret = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().min(1).optional(),
);

const environmentSchema = z.object({
  DATABASE_URL: z.url().startsWith("postgres"),
  CAMARA_BASE_URL: z.url().default("https://dadosabertos.camara.leg.br/api/v2"),
  SENADO_BASE_URL: z.url().default("https://legis.senado.leg.br/dadosabertos"),
  HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  HTTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(3),
  INITIAL_HISTORY_MONTHS: z.coerce.number().int().min(1).max(120).default(36),
  TSE_DATA_BASE_URL: z.url().default("https://cdn.tse.jus.br"),
  ELECTORAL_MEDIA_DIRECTORY: z.string().min(1).default(".data/electoral-assets"),
  ELECTION_YEAR: z.coerce.number().int().min(2026).max(9999).default(2026),
  GEO_PROVIDER: z.enum(["none", "cloudflare", "vercel"]).default("none"),
  OPENAI_API_KEY: optionalSecret,
  OPENAI_MODEL: optionalSecret,
  OPENAI_BASE_URL: z.url().default("https://api.openai.com/v1"),
  VAPID_SUBJECT: optionalSecret,
  VAPID_PUBLIC_KEY: optionalSecret,
  VAPID_PRIVATE_KEY: optionalSecret,
});

export function parseEnv(input: Readonly<Record<string, string | undefined>>) {
  const parsed = environmentSchema.parse(input);
  return {
    ...parsed,
    ELECTORAL_MEDIA_DIRECTORY: resolve(parsed.ELECTORAL_MEDIA_DIRECTORY),
  };
}

export const env = parseEnv(process.env);

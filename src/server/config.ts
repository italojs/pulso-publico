import { z } from "zod";

const environmentSchema = z.object({
  DATABASE_URL: z.url().startsWith("postgres"),
  CAMARA_BASE_URL: z.url().default("https://dadosabertos.camara.leg.br/api/v2"),
  SENADO_BASE_URL: z.url().default("https://legis.senado.leg.br/dadosabertos"),
  HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  HTTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(3),
  INITIAL_HISTORY_MONTHS: z.coerce.number().int().min(1).max(120).default(36),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).optional(),
  OPENAI_BASE_URL: z.url().default("https://api.openai.com/v1"),
  VAPID_SUBJECT: z.string().min(1).optional(),
  VAPID_PUBLIC_KEY: z.string().min(1).optional(),
  VAPID_PRIVATE_KEY: z.string().min(1).optional(),
});

export function parseEnv(input: Readonly<Record<string, string | undefined>>) {
  return environmentSchema.parse(input);
}

export const env = parseEnv(process.env);

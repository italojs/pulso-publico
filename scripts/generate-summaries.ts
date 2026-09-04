import { AiSummaryRepository } from "#/ai/repository";
import { OpenAiSummaryProvider } from "#/ai/openai-provider";
import { generateSummaryBatch } from "#/jobs/generate-summaries";
import { env } from "#/server/config";
import { db, sql } from "#/server/db/client";

if (!env.OPENAI_API_KEY || !env.OPENAI_MODEL) {
  console.log("Geração ignorada: configure OPENAI_API_KEY e OPENAI_MODEL no .env.");
  await sql.end();
  process.exit(0);
}

const provider = new OpenAiSummaryProvider({
  apiKey: env.OPENAI_API_KEY,
  model: env.OPENAI_MODEL,
  baseUrl: env.OPENAI_BASE_URL,
});
const result = await generateSummaryBatch(new AiSummaryRepository(db), provider, Number(process.argv[2] ?? 20));
console.log(JSON.stringify(result));
await sql.end();

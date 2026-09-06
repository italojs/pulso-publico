import { loadEnvFile } from "node:process";

try { loadEnvFile(".env"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }

const [{ AiSummaryRepository }, { OpenAiSummaryProvider }, { generateTopFeedSummaryBatch }, { env }, database] = await Promise.all([
  import("#/ai/repository"),
  import("#/ai/openai-provider"),
  import("#/jobs/generate-summaries"),
  import("#/server/config"),
  import("#/server/db/client"),
]);

if (!env.OPENAI_API_KEY || !env.OPENAI_MODEL) {
  console.log("Geração ignorada: configure OPENAI_API_KEY e OPENAI_MODEL no .env.");
  await database.sql.end();
  process.exit(0);
}

const provider = new OpenAiSummaryProvider({
  apiKey: env.OPENAI_API_KEY,
  model: env.OPENAI_MODEL,
  baseUrl: env.OPENAI_BASE_URL,
});
const result = await generateTopFeedSummaryBatch(new AiSummaryRepository(database.db), provider, Number(process.argv[2] ?? 100));
console.log(JSON.stringify(result));
await database.sql.end();

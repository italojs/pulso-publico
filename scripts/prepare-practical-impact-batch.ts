import { loadEnvFile } from "node:process";

try { loadEnvFile(".env"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }

const limitArgument = process.argv.find((argument) => argument.startsWith("--limit="));
const limit = Number(limitArgument?.slice("--limit=".length));
if (limit !== 600) throw new Error("Use exatamente --limit=600.");

const [{ preparePracticalImpactBatch }, database] = await Promise.all([
  import("#/server/ai/practical-impact-batch"),
  import("#/server/db/client"),
]);

const result = await preparePracticalImpactBatch(database.db, {
  limit,
  promptVersion: "plain-language-full-text-v3",
});
console.log(JSON.stringify(result));
await database.sql.end();

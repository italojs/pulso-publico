import { loadEnvFile } from "node:process";

try { loadEnvFile(".env"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }

const [{ verifyPracticalImpactBatch }, database] = await Promise.all([
  import("#/server/ai/practical-impact-batch"),
  import("#/server/db/client"),
]);

const result = await verifyPracticalImpactBatch(database.db, {
  promptVersion: "plain-language-full-text-v3",
});
console.log(JSON.stringify(result));
await database.sql.end();

if (result.total !== 600 || result.completed !== 600 || result.invalidCompleted > 0) {
  process.exitCode = 1;
}

import { loadEnvFile } from "node:process";

try { loadEnvFile(".env"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }

const expectedArgument = process.argv.find((argument) => argument.startsWith("--expected="));
const expected = Number(expectedArgument?.slice("--expected=".length) ?? 600);
if (!Number.isSafeInteger(expected) || expected < 1) throw new Error("Use --expected com um total positivo.");

const [{ verifyPracticalImpactBatch }, database] = await Promise.all([
  import("#/server/ai/practical-impact-batch"),
  import("#/server/db/client"),
]);

const result = await verifyPracticalImpactBatch(database.db, {
  promptVersion: "plain-language-full-text-v3",
});
console.log(JSON.stringify(result));
await database.sql.end();

if (result.total !== expected || result.completed !== expected || result.invalidCompleted > 0) {
  process.exitCode = 1;
}

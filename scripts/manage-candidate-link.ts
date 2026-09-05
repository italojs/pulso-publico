import { loadEnvFile } from "node:process";

function safeCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  return [
    "INVALID_ARGUMENTS",
    "UNSUPPORTED_ELECTION_YEAR",
    "INVALID_EVIDENCE_URL",
    "CANDIDATE_NOT_FOUND",
    "LAWMAKER_NOT_FOUND",
  ].includes(message) ? message : "LINK_REVIEW_FAILED";
}

try {
  loadEnvFile(".env");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

let closeDatabase: (() => Promise<void>) | undefined;

try {
  const { parseCandidateLinkCommand } = await import("#/jobs/reconcile-candidate-lawmakers");
  const command = parseCandidateLinkCommand(process.argv.slice(2));
  const [databaseModule, { ElectoralRepository }, { manageCandidateLink }] = await Promise.all([
    import("#/server/db/client"),
    import("#/server/electoral/repository"),
    import("#/jobs/reconcile-candidate-lawmakers"),
  ]);
  closeDatabase = () => databaseModule.sql.end({ timeout: 5 });
  const result = await manageCandidateLink(
    new ElectoralRepository(databaseModule.db),
    command,
  );
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(JSON.stringify({ status: "failed", code: safeCode(error) }));
  process.exitCode = error instanceof Error && error.message === "INVALID_ARGUMENTS" ? 2 : 1;
} finally {
  await closeDatabase?.();
}

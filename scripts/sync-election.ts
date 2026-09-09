import { loadEnvFile } from "node:process";

try {
  loadEnvFile(".env");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

let closeDatabase: (() => Promise<void>) | undefined;

try {
  const [
    { env },
    databaseModule,
    { withAdvisoryLock },
    { ElectoralRepository },
    { TseOpenDataClient },
    { DatabaseElectoralMediaStore },
    { syncElection },
  ] = await Promise.all([
    import("#/server/config"),
    import("#/server/db/client"),
    import("#/server/db/advisory-lock"),
    import("#/server/electoral/repository"),
    import("#/integrations/tse/client"),
    import("#/server/electoral/database-media-store"),
    import("#/jobs/sync-election"),
  ]);
  closeDatabase = () => databaseModule.sql.end({ timeout: 5 });
  const report = await syncElection(
    new TseOpenDataClient({
      baseUrl: env.TSE_DATA_BASE_URL,
      requestTimeoutMs: env.HTTP_TIMEOUT_MS,
    }),
    new DatabaseElectoralMediaStore(databaseModule.db),
    new ElectoralRepository(databaseModule.db),
    {
      electionYear: env.ELECTION_YEAR,
      now: () => new Date(),
      withLock: (name, operation) => withAdvisoryLock(
        databaseModule.sql,
        name,
        operation,
      ),
    },
  );
  console.log(JSON.stringify(report));
  if (report.failed) process.exitCode = 1;
} catch {
  console.error(JSON.stringify({ status: "failed", code: "STARTUP_ERROR" }));
  process.exitCode = 1;
} finally {
  await closeDatabase?.();
}

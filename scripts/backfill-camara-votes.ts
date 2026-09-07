import { loadEnvFile } from "node:process";

try {
  loadEnvFile(".env");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

function parseArguments(args: string[], defaultYear: number) {
  let fromYear = defaultYear;
  let refresh = false;
  for (const argument of args) {
    if (argument.startsWith("--from=")) {
      fromYear = Number(argument.slice("--from=".length));
    } else if (argument === "--refresh") {
      refresh = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  const throughYear = new Date().getUTCFullYear();
  if (!Number.isInteger(fromYear) || fromYear < 1946 || fromYear > throughYear) {
    throw new Error(`--from must be between 1946 and ${throughYear}`);
  }
  return { fromYear, throughYear, refresh };
}

let closeDatabase: (() => Promise<void>) | undefined;
try {
  const [
    { CamaraAdapter },
    { env },
    databaseModule,
    { LegislativeRepository },
    { backfillCamaraVotes },
    { withAdvisoryLock },
  ] = await Promise.all([
    import("#/integrations/camara/client"),
    import("#/server/config"),
    import("#/server/db/client"),
    import("#/server/db/repositories"),
    import("#/jobs/backfill-camara-votes"),
    import("#/server/db/advisory-lock"),
  ]);
  closeDatabase = () => databaseModule.sql.end({ timeout: 5 });
  const options = parseArguments(process.argv.slice(2), env.LEGISLATIVE_HISTORY_START_YEAR);
  const execution = await withAdvisoryLock(
    databaseModule.sql,
    "camara-individual-votes-backfill",
    () => backfillCamaraVotes(
      new CamaraAdapter(),
      new LegislativeRepository(databaseModule.db),
      options,
    ),
  );
  if (!execution.acquired) {
    console.log(JSON.stringify({ skipped: "already_running" }));
  } else {
    for (const report of execution.value) console.log(JSON.stringify(report));
    if (execution.value.some((report) => report.status === "failed")) process.exitCode = 1;
  }
} catch {
  console.error(JSON.stringify({ status: "failed", errorCode: "STARTUP_ERROR" }));
  process.exitCode = 1;
} finally {
  await closeDatabase?.();
}

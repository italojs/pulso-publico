import { loadEnvFile } from "node:process";

try {
  loadEnvFile(".env");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

function parseArguments(args: string[], defaultYear: number) {
  let fromYear = defaultYear;
  let sources = ["camara", "senado"] as Array<"camara" | "senado">;
  let refresh = false;
  for (const argument of args) {
    if (argument.startsWith("--from=")) {
      fromYear = Number(argument.slice("--from=".length));
    } else if (argument.startsWith("--source=")) {
      const value = argument.slice("--source=".length);
      if (value === "all") sources = ["camara", "senado"];
      else if (value === "camara" || value === "senado") sources = [value];
      else throw new Error("Use --source=camara, --source=senado or --source=all");
    } else if (argument === "--refresh") {
      refresh = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  const currentYear = new Date().getUTCFullYear();
  if (!Number.isInteger(fromYear) || fromYear < 1946 || fromYear > currentYear) {
    throw new Error(`--from must be between 1946 and ${currentYear}`);
  }
  return { fromYear, throughYear: currentYear, sources, refresh };
}

let closeDatabase: (() => Promise<void>) | undefined;
try {
  const [
    { CamaraAdapter },
    { SenadoAdapter },
    { env },
    databaseModule,
    { LegislativeRepository },
    { backfillLegislative },
    { withAdvisoryLock },
  ] = await Promise.all([
    import("#/integrations/camara/client"),
    import("#/integrations/senado/client"),
    import("#/server/config"),
    import("#/server/db/client"),
    import("#/server/db/repositories"),
    import("#/jobs/backfill-legislative"),
    import("#/server/db/advisory-lock"),
  ]);
  closeDatabase = () => databaseModule.sql.end({ timeout: 5 });
  const options = parseArguments(process.argv.slice(2), env.LEGISLATIVE_HISTORY_START_YEAR);
  const execution = await withAdvisoryLock(
    databaseModule.sql,
    "legislative-catalog-backfill",
    () => backfillLegislative(
      {
        camara: new CamaraAdapter(),
        senado: new SenadoAdapter(),
      },
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

import { loadEnvFile } from "node:process";

import { Temporal } from "@js-temporal/polyfill";

const USAGE = "Usage: npm run reconcile -- --source=all|camara|senado";

function loadLocalEnvironment() {
  try {
    loadEnvFile(".env");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function selectedSources(args: string[]) {
  if (args.length === 0) return ["camara", "senado"] as const;
  if (args.length !== 1 || !args[0]?.startsWith("--source=")) {
    throw new Error("INVALID_ARGUMENTS");
  }
  const value = args[0].slice("--source=".length);
  if (value === "all") return ["camara", "senado"] as const;
  if (value === "camara" || value === "senado") return [value] as const;
  throw new Error("INVALID_ARGUMENTS");
}

function previousUtcDay(now: Date) {
  const day = Temporal.Instant.from(now.toISOString())
    .toZonedDateTimeISO("UTC")
    .toPlainDate()
    .subtract({ days: 1 });
  const start = day.toZonedDateTime("UTC").toInstant();
  const nextStart = day.add({ days: 1 }).toZonedDateTime("UTC").toInstant();
  return {
    from: new Date(start.epochMilliseconds),
    to: new Date(nextStart.epochMilliseconds - 1),
  };
}

async function main() {
  let sources: readonly ("camara" | "senado")[];
  try {
    sources = selectedSources(process.argv.slice(2));
  } catch {
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }

  loadLocalEnvironment();
  let closeDatabase: (() => Promise<void>) | undefined;

  try {
    const [
      { CamaraAdapter },
      { SenadoAdapter },
      databaseModule,
      { LegislativeRepository },
      { withAdvisoryLock },
      { reconcileSource },
    ] = await Promise.all([
      import("#/integrations/camara/client"),
      import("#/integrations/senado/client"),
      import("#/server/db/client"),
      import("#/server/db/repositories"),
      import("#/server/db/advisory-lock"),
      import("#/jobs/reconcile"),
    ]);
    closeDatabase = async () => databaseModule.sql.end({ timeout: 5 });
    const repository = new LegislativeRepository(databaseModule.db);
    const adapters = {
      camara: new CamaraAdapter(),
      senado: new SenadoAdapter(),
    };
    const window = previousUtcDay(new Date());

    const execution = await withAdvisoryLock(
      databaseModule.sql,
      "legislative-reconcile",
      async () => {
        let failed = false;
        for (const source of sources) {
          const report = await reconcileSource(adapters[source], repository, window);
          console.log(JSON.stringify(report));
          failed ||= report.failed;
        }
        return { failed };
      },
    );

    if (!execution.acquired) {
      console.log(JSON.stringify({ skipped: "already_running" }));
    } else if (execution.value.failed) {
      process.exitCode = 1;
    }
  } catch {
    console.error(JSON.stringify({ status: "failed", code: "STARTUP_ERROR" }));
    process.exitCode = 1;
  } finally {
    await closeDatabase?.();
  }
}

await main();

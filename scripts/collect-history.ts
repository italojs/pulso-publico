import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { loadEnvFile } from "node:process";

for (const filename of [".env.production.local", ".env"]) {
  try {
    loadEnvFile(filename);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

const { parseHistoricalCollectorArguments } = await import("#/jobs/historical-collector");
let arguments_: ReturnType<typeof parseHistoricalCollectorArguments>;
try {
  arguments_ = parseHistoricalCollectorArguments(
    process.argv.slice(2),
    new Date().getUTCFullYear(),
  );
} catch {
  console.error(JSON.stringify({ status: "failed", errorCode: "INVALID_ARGUMENTS" }));
  process.exitCode = 2;
  process.exit();
}

const controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => controller.abort());
}

let closeDatabase: (() => Promise<void>) | undefined;
try {
  const [
    { CamaraAdapter },
    { SenadoAdapter },
    { db, sql },
    { HistoricalTaskRepository },
    { LegislativeRepository },
    { HistoricalBillReader },
    { createLegislativeHistoricalTaskExecutor },
    { runHistoricalCollector },
    { readHistoricalStorage },
    { loadReferencedLawmakers },
    { resolveBicameralPartner },
  ] = await Promise.all([
    import("#/integrations/camara/client"),
    import("#/integrations/senado/client"),
    import("#/server/db/client"),
    import("#/server/historical/task-repository"),
    import("#/server/db/repositories"),
    import("#/server/historical/bill-reader"),
    import("#/jobs/historical-task-executor"),
    import("#/jobs/historical-collector"),
    import("#/jobs/historical-status"),
    import("#/server/legislative/persist-bill-graph"),
    import("#/server/legislative/reconcile-bicameral"),
  ]);
  closeDatabase = () => sql.end({ timeout: 5 });
  const minimumIntervalMs = 60_000 / arguments_.requestsPerMinute;
  const adapters = {
    camara: new CamaraAdapter({ minimumIntervalMs }),
    senado: new SenadoAdapter({ minimumIntervalMs }),
  };
  const legislativeRepository = new LegislativeRepository(db);
  const billReader = new HistoricalBillReader(db);
  const executor = createLegislativeHistoricalTaskExecutor({
    adapters,
    billReader,
    voteReader: billReader,
    persistBillGraph: (transaction, graph) =>
      legislativeRepository.upsertBillGraphInTransaction(transaction, graph),
    persistLawmakers: (transaction, lawmakers) =>
      legislativeRepository.upsertLawmakersInTransaction(transaction, lawmakers),
    persistArchivedVotes: (transaction, items) =>
      legislativeRepository.upsertArchivedIndividualVotesInTransaction(transaction, items),
    loadReferencedLawmakers: (adapter, externalIds) =>
      loadReferencedLawmakers(adapter, legislativeRepository, externalIds),
    resolveBicameralPartner: (bill) => resolveBicameralPartner(bill, {
      repository: legislativeRepository,
      adapters,
    }),
    validateYear: (source, year) =>
      legislativeRepository.validateHistoricalYear(source, year),
  });

  const report = await runHistoricalCollector(
    {
      repository: new HistoricalTaskRepository(db),
      executor,
      readStorageLevel: async () => {
        const configuredCapacity = process.env.HISTORICAL_DATABASE_CAPACITY_BYTES;
        const capacityBytes = configuredCapacity ? BigInt(configuredCapacity) : undefined;
        return (await readHistoricalStorage(db, capacityBytes)).level;
      },
    },
    {
      fromYear: arguments_.fromYear,
      throughYear: arguments_.throughYear,
      sources: arguments_.sources,
      workerId: `${hostname()}:${process.pid}:${randomUUID()}`,
      leaseMs: 5 * 60_000,
      once: arguments_.once,
      signal: controller.signal,
    },
  );
  console.log(JSON.stringify({ status: "complete", ...report }));
  if (report.reason === "blocked") process.exitCode = 1;
} catch {
  console.error(JSON.stringify({ status: "failed", errorCode: "STARTUP_ERROR" }));
  process.exitCode = 1;
} finally {
  await closeDatabase?.();
}

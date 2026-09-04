import { loadEnvFile } from "node:process";

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
    throw new Error("Use --source=camara, --source=senado or --source=all");
  }
  const value = args[0].slice("--source=".length);
  if (value === "all") return ["camara", "senado"] as const;
  if (value === "camara" || value === "senado") return [value] as const;
  throw new Error("Use --source=camara, --source=senado or --source=all");
}

loadLocalEnvironment();

let closeDatabase: (() => Promise<void>) | undefined;

try {
  const sources = selectedSources(process.argv.slice(2));
  const [
    { CamaraAdapter },
    { SenadoAdapter },
    { env },
    databaseModule,
    { LegislativeRepository },
    { withAdvisoryLock },
    { syncSource },
  ] = await Promise.all([
    import("#/integrations/camara/client"),
    import("#/integrations/senado/client"),
    import("#/server/config"),
    import("#/server/db/client"),
    import("#/server/db/repositories"),
    import("#/server/db/advisory-lock"),
    import("#/jobs/sync-source"),
  ]);
  closeDatabase = async () => databaseModule.sql.end({ timeout: 5 });
  const repository = new LegislativeRepository(databaseModule.db);
  const adapters = {
    camara: new CamaraAdapter(),
    senado: new SenadoAdapter(),
  };
  const execution = await withAdvisoryLock(
    databaseModule.sql,
    "legislative-sync",
    async () => {
      let failed = false;
      for (const source of sources) {
        const report = await syncSource(adapters[source], repository, new Date(), {
          initialHistoryMonths: env.INITIAL_HISTORY_MONTHS,
        });
        console.log(JSON.stringify(report));
        failed ||= report.failed;
      }
      const [{ WebPushProvider }, { PushRepository }, { dispatchPendingPush }] = await Promise.all([
        import("#/alerts/push-provider"),
        import("#/alerts/push-repository"),
        import("#/jobs/dispatch-push"),
      ]);
      const pushReport = await dispatchPendingPush(
        new PushRepository(databaseModule.db),
        new WebPushProvider({
          subject: env.VAPID_SUBJECT,
          publicKey: env.VAPID_PUBLIC_KEY,
          privateKey: env.VAPID_PRIVATE_KEY,
        }),
      );
      console.log(JSON.stringify({ notifications: pushReport }));
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

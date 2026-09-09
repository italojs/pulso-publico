import { loadEnvFile } from "node:process";

for (const filename of [".env.production.local", ".env"]) {
  try {
    loadEnvFile(filename);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

let closeDatabase: (() => Promise<void>) | undefined;
try {
  const [{ db, sql }, { HistoricalTaskRepository }] = await Promise.all([
    import("#/server/db/client"),
    import("#/server/historical/task-repository"),
  ]);
  closeDatabase = () => sql.end({ timeout: 5 });
  const tasks = await new HistoricalTaskRepository(db).listStatus();
  const counts = Object.fromEntries(
    ["pending", "running", "waiting", "complete", "failed"].map((status) => [
      status,
      tasks.filter((task) => task.status === status).length,
    ]),
  );
  console.log(JSON.stringify({ status: "ok", tasks: counts }));
} catch {
  console.error(JSON.stringify({ status: "failed", errorCode: "STATUS_UNAVAILABLE" }));
  process.exitCode = 1;
} finally {
  await closeDatabase?.();
}

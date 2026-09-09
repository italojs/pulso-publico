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
  const [{ db, sql }, { readHistoricalStatus }] = await Promise.all([
    import("#/server/db/client"),
    import("#/jobs/historical-status"),
  ]);
  closeDatabase = () => sql.end({ timeout: 5 });
  const configuredCapacity = process.env.HISTORICAL_DATABASE_CAPACITY_BYTES;
  const capacityBytes = configuredCapacity ? BigInt(configuredCapacity) : undefined;
  const report = await readHistoricalStatus(db, capacityBytes);
  console.log(JSON.stringify({ status: "ok", ...report }));
} catch {
  console.error(JSON.stringify({ status: "failed", errorCode: "STATUS_UNAVAILABLE" }));
  process.exitCode = 1;
} finally {
  await closeDatabase?.();
}

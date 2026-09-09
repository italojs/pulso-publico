import postgres from "postgres";

const connectionUrl = process.env.DATABASE_URL;
if (!connectionUrl || !/^postgres(?:ql)?:\/\//u.test(connectionUrl)) {
  console.error(JSON.stringify({ status: "failed", errorCode: "CONNECTION_REQUIRED" }));
  process.exitCode = 2;
} else {
  const client = postgres(connectionUrl, { max: 1 });
  try {
    const [identity] = await client<{
      database: string;
      user: string;
      superuser: boolean;
      sizeBytes: string;
    }[]>`
      select
        current_database() as database,
        current_user as "user",
        role.rolsuper as superuser,
        pg_database_size(current_database())::text as "sizeBytes"
      from pg_roles as role
      where role.rolname = current_user
    `;
    if (!identity) throw new Error("IDENTITY_UNAVAILABLE");

    const requiredTableNames = [
      "bills",
      "lawmakers",
      "movements",
      "vote_events",
      "individual_votes",
      "electoral_candidates",
      "electoral_media_blobs",
      "historical_collection_tasks",
      "historical_collection_runs",
    ] as const;
    const tableRows = await client<{ tableName: string; available: boolean }[]>`
      select
        required.name as "tableName",
        to_regclass('public.' || required.name) is not null as available
      from unnest(${client.array([...requiredTableNames])}::text[]) as required(name)
      order by required.name
    `;
    const [migrationRow] = await client<{ count: string }[]>`
      select count(*)::text as count
      from drizzle.__drizzle_migrations
    `;

    console.log(JSON.stringify({
      status: "ok",
      database: identity.database,
      user: identity.user,
      superuser: identity.superuser,
      migrationCount: Number(migrationRow?.count ?? 0),
      sizeBytes: identity.sizeBytes,
      requiredTables: Object.fromEntries(
        tableRows.map((row) => [row.tableName, row.available]),
      ),
    }));
    if (identity.superuser || tableRows.some((row) => !row.available)) {
      process.exitCode = 1;
    }
  } catch {
    console.error(JSON.stringify({ status: "failed", errorCode: "DATABASE_VERIFICATION_FAILED" }));
    process.exitCode = 1;
  } finally {
    await client.end({ timeout: 5 });
  }
}

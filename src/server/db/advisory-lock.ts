import type postgres from "postgres";

export type AdvisoryLockResult<T> =
  | { acquired: false }
  | { acquired: true; value: T };

export async function withAdvisoryLock<T>(
  sql: Pick<postgres.Sql, "reserve">,
  name: string,
  operation: () => Promise<T>,
): Promise<AdvisoryLockResult<T>> {
  const connection = await sql.reserve();
  let acquired = false;

  try {
    const [row] = await connection<{ acquired: boolean }[]>`
      select pg_try_advisory_lock(hashtext(${name})) as acquired
    `;
    acquired = row?.acquired === true;
    if (!acquired) return { acquired: false };

    return { acquired: true, value: await operation() };
  } finally {
    try {
      if (acquired) {
        await connection`select pg_advisory_unlock(hashtext(${name}))`;
      }
    } finally {
      connection.release();
    }
  }
}
